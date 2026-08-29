"""Reading the xUSSR Railway Set: C preprocessor, NML parser, constant folding.

The set is NML behind a C preprocessor (see its compile*.bat): every root .pnml is
expanded with `cc -C -E -P -x c` and the result is read with the parser of the `nml`
package itself, so the numbers come from what the game compiles rather than from the
set's own documentation. Nothing here compiles a GRF — the AST is enough.

Kept apart from extract_xussr.py so the reading machinery can be unit tested without
running the whole extraction.
"""
import os
import shutil
import subprocess
import sys

from nml import generic, global_constants, nmlop, parser as nml_parser
from nml.actions import real_sprite
from nml.ast import sprite_container

from common import VENDOR

XUSSR_ROOT = os.path.join(VENDOR, "xussrset")

# The set's own version counter lives outside the repository (a file on the author's
# disk, see compile.bat :GetHgRev). It only ever reaches the GRF version string, which
# the calculator does not read, so a fixed value keeps the extraction reproducible.
REPO_REVISION = 1


class Unknown(Exception):
    """The expression depends on something only the running game knows."""


def preprocess(root_pnml, out_path):
    """Expand one root .pnml into flat NML, exactly as the set's compile scripts do."""
    compiler = os.environ.get("CC") or shutil.which("cc") or shutil.which("gcc")
    if compiler is None:
        raise SystemExit(
            "extract_xussr: no C preprocessor found. The xUSSR sources are .pnml — NML "
            "behind the C preprocessor — so a compiler has to be on PATH (macOS: Xcode "
            "command line tools provide `cc`; Linux: gcc). Set CC to point at one."
        )
    subprocess.run(
        [
            compiler,
            f"-DREPO_REVISION={REPO_REVISION}",
            f"-DMIN_COMPATIBLE_REVISION={REPO_REVISION}",
            "-E", "-C", "-P", "-x", "c",
            "-o", out_path,
            root_pnml,
        ],
        check=True,
        cwd=XUSSR_ROOT,
    )
    return out_path


def parse(path, name):
    """Parse an expanded .nml file into statements."""
    with open(path, encoding="utf-8") as f:
        return parse_text(f.read(), name)


def parse_text(text, name):
    """Parse NML source into statements.

    The nml package keeps its "defined only once" registries in module globals, so they
    are cleared between GRFs — nine sets in one process would otherwise collide on the
    first shared block name (every one of them declares `dummy_sprites`).
    """
    generic.OnlyOnce.clear()
    sprite_container.SpriteContainer.sprite_blocks.clear()
    real_sprite.sprite_template_map.clear()
    sys.setrecursionlimit(30000)
    return nml_parser.NMLParser().parse(text, name).statements


# --- expression evaluation -------------------------------------------------------

def _num(value):
    """Evaluated values are ints; nml's comparison operators hand back bools."""
    return int(value) if isinstance(value, bool) else value


def evaluate(expr, scope):
    """Fold an nml expression to a number using `scope` for names and game variables.

    `scope` maps identifiers (GRF parameters, the set's own named constants, and the
    game variables an extraction has to pin down — `age_in_days`, `position_in_consist`)
    to numbers, and may carry a `functions` entry for calls the running game answers,
    such as `tile_powers_railtype`. Anything else raises Unknown: a value the calculator
    cannot know is a value it must not guess.
    """
    kind = type(expr).__name__
    if kind in ("ConstantNumeric", "ConstantFloat"):
        return expr.value
    if kind == "StringLiteral":
        return expr.value
    if kind == "Identifier":
        name = expr.value
        if name in scope:
            return _num(scope[name])
        raise Unknown(f"identifier {name}")
    if kind == "BinOp":
        return _binop(expr, scope)
    if kind == "TernaryOp":
        return evaluate(expr.expr1 if _num(evaluate(expr.guard, scope)) else expr.expr2, scope)
    if kind == "Boolean":  # `!!x`, how NML writes "force to 0/1"
        return int(_num(evaluate(expr.expr, scope)) != 0)
    if kind == "Not":
        return int(_num(evaluate(expr.expr, scope)) == 0)
    if kind == "BinNot":
        return ~_num(evaluate(expr.expr, scope))
    if kind == "AbsOp":
        return abs(_num(evaluate(expr.expr, scope)))
    if kind == "BitMask":
        mask = 0
        for value in expr.values:
            mask |= 1 << _num(evaluate(value, scope))
        return mask
    if kind == "FunctionCall":
        return _call(expr, scope)
    raise Unknown(f"expression node {kind}")


def _binop(expr, scope):
    """Fold a binary operation, absorbing an unknown side where the other decides.

    NML compiles `a || b` to `!!a | !!b` and `a && b` to `!!a & !!b`, so the operands of
    those are 0 or 1 and one known side can settle the answer alone. The sets need this:
    whole blocks are gated on `grf_future_status("…") && (param == 4)` — whether another
    GRF is loaded is unknowable here, but the parameter still decides the block.
    """
    sides = []
    for operand in (expr.expr1, expr.expr2):
        try:
            sides.append(_num(evaluate(operand, scope)))
        except Unknown as unknown:
            sides.append(unknown)
    known = [v for v in sides if not isinstance(v, Unknown)]
    if len(known) < 2:
        if expr.op is nmlop.AND and 0 in known:
            return 0
        if expr.op is nmlop.OR and 1 in known:
            return 1
        raise next(v for v in sides if isinstance(v, Unknown))
    if expr.op.compiletime_func is None:
        raise Unknown(f"operator {expr.op}")
    return _num(expr.op.compiletime_func(*known))


_BUILTINS = {
    "int": lambda a: int(a),
    "round": lambda a: int(a + 0.5) if a >= 0 else -int(-a + 0.5),
    "min": min,
    "max": max,
    "bitmask": lambda *bits: _bits(bits),
    "hasbit": lambda value, bit: int(bool(value & (1 << bit))),
    "nothasbit": lambda value, bit: int(not value & (1 << bit)),
    # dates only ever reach comparisons and year extraction here, so an encoding
    # that preserves order is enough
    "date": lambda y, m, d: y * 10000 + m * 100 + d,
    # the sets refuse to load on old game versions, so the version test has to fold;
    # extraction always reads the current-version branch
    "version_openttd": lambda major, minor, build=0, revision=0: (
        (major << 28) | (minor << 24) | (build << 20) | (revision or 0xFFFFF)
    ),
}


def game_functions(grfids, cargo_labels):
    """Answers to the calls the running game would answer, fixed for the extraction.

    `grf_future_status` asks whether another GRF is loaded: true for the xUSSR files the
    calculator reads, false for everything else (the set also looks for YETI, ECS and
    OpenTTD Industry Set, which the calculator does not model). `cargotype_available`
    asks whether a cargo is in the game's table: true for the labels the set's own cargo
    table names, which both FIRS and the base game supply.
    """
    return {
        "grf_future_status": lambda grfid: int(grfid in grfids),
        "cargotype_available": lambda label: int(label in cargo_labels),
    }


def base_scope():
    """Names every NML file may use: the language's own constants, plus the two the sets
    test the running game by (`ttd_platform`, `openttd_version`).

    Only the plain-valued entries of nml's constant list are taken; the rest map names to
    game *variables* (`climate`, `current_palette`), which have no value outside a game.
    """
    scope = {}
    for entry in global_constants.const_list:
        table = entry[0] if isinstance(entry, tuple) else entry
        for name, value in table.items():
            if isinstance(value, (int, float, str)):
                scope[name] = value
    scope["ttd_platform"] = scope["PLATFORM_OPENTTD"]
    scope["openttd_version"] = 0xFFFFFFFF
    return scope


def _bits(bits):
    mask = 0
    for bit in bits:
        mask |= 1 << int(bit)
    return mask


def _call(expr, scope):
    name = expr.name.value
    functions = scope.get("functions", {})
    if name in functions:
        return functions[name](*[_raw_arg(p, scope) for p in expr.params])
    if name in _BUILTINS:
        return _num(_BUILTINS[name](*[_num(evaluate(p, scope)) for p in expr.params]))
    raise Unknown(f"function {name}")


def _raw_arg(param, scope):
    """A game-variable call takes its argument literally: `tile_powers_railtype("T_A0")`."""
    if type(param).__name__ == "StringLiteral":
        return param.value
    if type(param).__name__ == "Identifier":
        return param.value
    return evaluate(param, scope)


def const(expr, scope):
    """Fold to an int, or raise Unknown."""
    value = evaluate(expr, scope)
    if isinstance(value, str):
        raise Unknown("string where a number was expected")
    return value


# --- statements ------------------------------------------------------------------

def grf_parameters(grf):
    """Default values of the GRF's own parameters, by the name the sources use.

    The calculator extracts at the set's defaults (spec `xussr-dataset`), so this is
    also what lands in the data as "the parameters these numbers hold for".
    """
    defaults = {}
    for param in grf.params:
        for setting in param.setting_list:
            for prop in setting.value_list:
                if str(prop.name) == "def_value":
                    defaults[setting.name.value] = prop.value.reduce().value
    return defaults


def flatten(statements, scope):
    """Statement list with if/else blocks resolved at the set's default parameters.

    One pass, in source order: the sets assign their own constants between the blocks
    that test them (`xUSSRset_disable_diesel = 1;` right above the `if` that reads it),
    so resolving conditionals and folding assignments cannot be two passes. `scope` is
    updated in place, and holds the set's constants once the walk is done.
    """
    out = []
    for stmt in statements:
        kind = type(stmt).__name__
        if kind == "ConditionalList":
            out.extend(_take_branch(stmt, scope))
        elif kind == "ParameterAssignment":
            _assign(stmt, scope)
            out.append(stmt)
        else:
            out.append(stmt)
    return out


def _assign(stmt, scope):
    """The set's own `name = value;` — NML calls it a parameter, the sources use it as a
    constant (`delta_age = 1;`) and as a switch between GRFs (`xUSSRset_disable_diesel`)."""
    if type(stmt.param).__name__ != "Identifier":
        return
    try:
        scope[stmt.param.value] = const(stmt.value, scope)
    except Unknown:
        scope.pop(stmt.param.value, None)


def _take_branch(conditional_list, scope):
    for conditional in conditional_list.statements:
        if conditional.expr is None:  # else
            return flatten(conditional.statements, scope)
        if _num(evaluate(conditional.expr, scope)):
            return flatten(conditional.statements, scope)
    return []


# --- switch-chain emulation -------------------------------------------------------

class Emulator:
    """Runs a chain of NML switches the way the game's callback machinery would.

    The set computes running cost, power and capacity in switches wired to each other,
    passing intermediate values through the temporary registers (STORE_TEMP/LOAD_TEMP).
    The emulator follows one callback for one vehicle: `scope` pins down the game
    variables the chain reads (`age_in_days`, `cargo_type_in_veh`, the
    `tile_powers_railtype` answers), and anything unpinned raises Unknown rather than
    guessing — a chain this extraction cannot settle is a number it must not invent.
    """

    def __init__(self, switches, scope):
        self.switches = switches
        self.base_scope = scope

    def run(self, name, variables, depth=0):
        """Follow the chain from switch `name`; returns the final `return` expression
        folded to a number, or the expression itself if it does not fold (the caller
        may recognise its shape — see `mass_pair`)."""
        if depth > 50:
            raise Unknown(f"switch chain deeper than 50 at {name}")
        switch = self.switches.get(name)
        if switch is None:
            raise Unknown(f"switch {name} is not defined")
        registers = variables.setdefault("_registers", {})
        scope = dict(self.base_scope)
        scope.update(variables)
        functions = dict(scope.get("functions", {}))
        functions["STORE_TEMP"] = lambda value, reg: registers.__setitem__(int(reg), value) or value
        functions["LOAD_TEMP"] = lambda reg: registers.get(int(reg), 0)
        scope["functions"] = functions
        value = self._switch_value(switch.expr, scope)
        chosen = switch.body.default
        for case in switch.body.ranges:
            if self._matches(case, value, scope):
                chosen = case.result
                break
        if chosen is None:
            raise Unknown(f"switch {name}: no case matched {value!r} and no default")
        if chosen.value is None:  # bare `return;`: the switch expression's own value
            return value
        if type(chosen.value).__name__ == "Identifier" and chosen.value.value in self.switches:
            # a case naming another switch chains to it, with or without `return` —
            # the game runs the named block either way
            return self.run(chosen.value.value, variables, depth + 1)
        try:
            return evaluate(chosen.value, scope)
        except Unknown:
            return Partial(chosen.value, scope)

    def _switch_value(self, expr, scope):
        """A switch expression is either one expression or a [a, b, …] list evaluated
        in order for its side effects, whose last element is the value."""
        if type(expr).__name__ == "Array":
            value = 0
            for element in expr.values:
                value = evaluate(element, scope)
            return value
        return evaluate(expr, scope)

    def _matches(self, case, value, scope):
        lo = const(case.min, scope)
        hi = const(case.max, scope)
        return lo <= _num(value) <= hi


class Partial:
    """A final `return` expression that did not fold — it still depends on a game
    variable, most often `cargo_unit_weight`. Carries the expression and the scope it
    stopped in, for shape recognisers like `mass_pair`.

    Public on purpose: the extractors both build these and test for them, so the name
    is part of what this module offers rather than an implementation detail."""

    def __init__(self, expr, scope):
        self.expr = expr
        self.scope = scope


def mass_pair(partial):
    """Recognise the set's capacity formula and split it into its two mass components.

    Every cargo-dependent capacity in the set folds to
    `min(X / cargo_unit_weight, Y / cargo_unit_weight / 125)` with X and Y constant for
    a given wagon and cargo: X is carrying capacity in 1/16 t, Y the volume component.
    The unit weight belongs to the active cargo set (FIRS and vanilla may differ), so
    the pair is stored and the division happens in the calculator, keeping the integer
    arithmetic in the set's own order. Returns (X, Y) or None if the shape is foreign.
    """
    expr = _strip_known_ternaries(partial.expr, partial.scope)
    if type(expr).__name__ != "FunctionCall" or expr.name.value != "min" or len(expr.params) != 2:
        return None
    first = _over_unit_weight(expr.params[0], partial.scope)
    second = _over_unit_weight_and_125(expr.params[1], partial.scope)
    if first is None or second is None:
        return None
    return first, second


def _strip_known_ternaries(expr, scope):
    """Resolve `cond ? a : b` guards that do fold (the ECS/YETI presence flags)."""
    while type(expr).__name__ == "TernaryOp":
        try:
            taken = _num(evaluate(expr.guard, scope))
        except Unknown:
            return expr
        expr = expr.expr1 if taken else expr.expr2
    return expr


def _over_unit_weight(expr, scope):
    """`X / cargo_unit_weight` with X constant → X."""
    if (
        type(expr).__name__ == "BinOp"
        and expr.op is nmlop.DIV
        and type(expr.expr2).__name__ == "Identifier"
        and expr.expr2.value == "cargo_unit_weight"
    ):
        try:
            return const(expr.expr1, scope)
        except Unknown:
            return None
    return None


def _over_unit_weight_and_125(expr, scope):
    """`Y / cargo_unit_weight / 125` with Y constant → Y."""
    if (
        type(expr).__name__ == "BinOp"
        and expr.op is nmlop.DIV
        and type(expr.expr2).__name__ == "ConstantNumeric"
        and expr.expr2.value == 125
    ):
        return _over_unit_weight(expr.expr1, scope)
    return None

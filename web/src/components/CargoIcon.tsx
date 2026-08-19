import { Image } from '@mantine/core';

/** Cargo icon: FIRS or the OpenGFX2 base set — the path comes from the data. */
export function CargoIcon({ icon }: { icon: string }) {
  if (!icon) return null;
  return (
    <Image
      className="cargo-icon"
      src={`${import.meta.env.BASE_URL}${icon}`}
      alt=""
      w={10}
      h={10}
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

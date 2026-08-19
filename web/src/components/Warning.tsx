import { Alert } from '@mantine/core';

/**
 * A condition the calculator cannot compensate for — inflation being on, a
 * dataset switched off. It stays on screen for as long as the condition holds,
 * which is why this is an Alert and not a notification.
 */
export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <Alert
      className="warning"
      role="alert"
      icon={
        <span className="warning-icon" aria-hidden="true">
          ⚠
        </span>
      }
    >
      {children}
    </Alert>
  );
}

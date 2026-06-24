'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        padding: '40px 20px',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Something went wrong</h1>
      <p
        style={{
          color: '#ef4444',
          background: '#fef2f2',
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 14,
          wordBreak: 'break-word',
        }}
      >
        {error.message}
      </p>
      {error.digest && (
        <p style={{ color: '#888', fontSize: 12, marginBottom: 16 }}>
          Error digest: {error.digest}
        </p>
      )}
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
        Stack: {error.stack?.split('\n').slice(0, 4).join('\n')}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '8px 24px',
          borderRadius: 8,
          border: 'none',
          background: '#006aff',
          color: '#fff',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}

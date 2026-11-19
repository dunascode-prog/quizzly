"use client";

// Loading and error states for an admin page's data. An error keeps any data already shown.
export function DataState({ loading, error, onRetry }: { loading: boolean; error?: string; onRetry: () => void }) {
  if (error) {
    return (
      <div className="a-card a-state" role="alert">
        <p className="a-error">{error}</p>
        <button type="button" className="a-btn" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (loading) return <p className="a-muted a-state">Loading…</p>;
  return null;
}

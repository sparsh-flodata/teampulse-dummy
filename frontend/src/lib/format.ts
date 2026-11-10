export const dateLabel = (date: string, today?: string) =>
  date === today
    ? "Today"
    : new Date(date + "T12:00:00").toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
      });

export const ago = (date: string, now = Date.now()) => {
  const m = Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000));
  return m < 1
    ? "Just now"
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : `${Math.floor(m / 1440)}d ago`;
};

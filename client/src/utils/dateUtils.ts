/**
 * Date and timestamp formatting utilities for chat timeline and conversation lists.
 * Uses local browser time.
 */

/**
 * Format a timestamp for message bubbles (e.g., "10:42 AM").
 */
export function formatMessageTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

/**
 * Format a timestamp for conversation list activity (e.g., "Just now", "5m ago", "Yesterday", "Aug 25").
 */
export function formatConversationTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) {
      return 'Just now';
    }
    if (diffMin < 60) {
      return `${diffMin}m ago`;
    }
    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return formatMessageTime(isoString);
    }
    if (diffDays === 1 || (diffDays < 2 && date.getDate() === now.getDate() - 1)) {
      return 'Yesterday';
    }
    // Within the last week, the weekday reads faster than a date ("Tue", not "Aug 25").
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * The separator above the first message of each day in the timeline: "Today", "Yesterday",
 * a weekday within the last week, then a date.
 */
export function formatDayLabel(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';

    const startOfDay = (value: Date) =>
      new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

    const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

    if (dayDiff <= 0) return 'Today';
    if (dayDiff === 1) return 'Yesterday';
    if (dayDiff < 7) return date.toLocaleDateString([], { weekday: 'long' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

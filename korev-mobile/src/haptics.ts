import {
  impactAsync,
  ImpactFeedbackStyle,
  notificationAsync,
  NotificationFeedbackType,
} from 'expo-haptics';

function feedbackWhenDone(type: NotificationFeedbackType) {
  return (done = true) => {
    if (done) void notificationAsync(type);
    return done;
  };
}

export const succeeded = feedbackWhenDone(NotificationFeedbackType.Success);
export const warned = feedbackWhenDone(NotificationFeedbackType.Warning);

export function lifted() {
  void impactAsync(ImpactFeedbackStyle.Medium);
}

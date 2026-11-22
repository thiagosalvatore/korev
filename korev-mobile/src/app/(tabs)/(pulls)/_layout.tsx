import { Stack } from 'expo-router';
import { TabStack } from '../../../TabStack';

export default function PullRequestsStack() {
  return (
    <TabStack>
      <Stack.Screen name="pulls" options={{ title: 'Pull requests' }} />
    </TabStack>
  );
}

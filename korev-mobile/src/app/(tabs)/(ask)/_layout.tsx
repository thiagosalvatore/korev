import { Stack } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { openNewAsk } from '../../../navigation';
import { HEADER_ICON_SIZE, HeaderButton, TabStack } from '../../../TabStack';
import { useTheme } from '../../../theme';

export default function AskStack() {
  const theme = useTheme();
  return (
    <TabStack>
      <Stack.Screen
        name="ask"
        options={{
          title: 'Ask',
          headerRight: () => (
            <HeaderButton label="Ask a question" onPress={openNewAsk}>
              <Plus size={HEADER_ICON_SIZE} color={theme.fg1} />
            </HeaderButton>
          ),
        }}
      />
    </TabStack>
  );
}

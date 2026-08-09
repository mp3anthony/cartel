import { StatusBar } from 'expo-status-bar';

import { envResult } from './src/lib/env';
import { ConfigErrorScreen } from './src/screens/ConfigErrorScreen';
import { PlaceholderScreen } from './src/screens/PlaceholderScreen';
import { ThemeProvider } from './src/theme/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider>
      {envResult.ok ? (
        <PlaceholderScreen env={envResult.env} />
      ) : (
        <ConfigErrorScreen
          problem={envResult.problem}
          remedy={envResult.remedy}
        />
      )}
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}

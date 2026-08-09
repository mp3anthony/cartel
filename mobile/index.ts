// Must be the first import in the app. React Native's built-in URL is incomplete,
// and `src/lib/env.ts` calls `new URL()` at module load — before any other module
// gets a chance to install the polyfill. Browsers have a real URL built in, so
// getting this order wrong is invisible on web and only breaks on device.
import 'react-native-url-polyfill/auto';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

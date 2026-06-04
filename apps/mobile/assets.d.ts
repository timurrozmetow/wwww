// Lets TS understand static image imports (`import logo from './x.png'`); Metro
// resolves them to a RN asset module at bundle time.
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const content: ImageSourcePropType;
  export default content;
}

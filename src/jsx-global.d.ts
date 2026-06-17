/**
 * Re-export React's JSX namespace as the global JSX namespace so that
 * legacy `: JSX.Element` return-type annotations compile under the
 * react-jsx transform (React 19 / TypeScript 5).
 */
import type React from "react";

declare global {
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementType = React.JSX.ElementType;
    type IntrinsicElements = React.JSX.IntrinsicElements;
    type IntrinsicAttributes = React.JSX.IntrinsicAttributes;
    type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute;
  }
}

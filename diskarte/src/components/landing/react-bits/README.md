# Electric Logo

Vendored from [React Bits Electric Logo](https://reactbits.dev/animations/electric-logo),
[TypeScript/Tailwind source](https://github.com/DavidHDev/react-bits/blob/main/src/ts-tailwind/Animations/ElectricLogo/ElectricLogo.tsx), retrieved 2026-10-16.
The upstream MIT + Commons Clause license is included in LICENSE.md.

Local changes require an explicit image source, remove the generic bolt fallback,
cap device pixel ratio at 1, and leave the static brand image visible if WebGL initialization fails.
HeroLogo controls reduced motion, low-data/device eligibility, tab visibility, offscreen
unmounting, context loss, and the user's pause control. The upstream component releases its
animation frame, observers, listeners, canvas, and WebGL context when unmounted.

The canvas reads the existing image alpha to build the upstream distance-field effect;
it does not draw or redesign the logo. This module is dynamically imported by the public hero only.

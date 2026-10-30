import { lazy, Suspense, type ComponentType } from "react";
export default function dynamic<T extends object>(
  loader: () => Promise<ComponentType<T> | { default: ComponentType<T> }>,
  options?: { loading?: ComponentType; ssr?: boolean },
) {
  const Component = lazy(async () => {
    const loaded = await loader();
    return { default: "default" in loaded ? loaded.default : loaded };
  });
  const Loading = options?.loading;
  return function Dynamic(props: T) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Component {...props} />
      </Suspense>
    );
  };
}

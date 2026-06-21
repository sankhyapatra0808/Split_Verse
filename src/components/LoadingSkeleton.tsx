type LoadingSkeletonProps = {
  wide?: boolean;
  light?: boolean;
};

export default function LoadingSkeleton({
  wide = false,
  light = false,
}: LoadingSkeletonProps) {
  return (
    <span
      className={[
        "app-loading-skeleton",
        wide ? "wide" : "",
        light ? "light" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Loading value"
    />
  );
}

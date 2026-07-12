import Image from "next/image";

type Props = {
  size?: number;
  className?: string;
  priority?: boolean;
};

export function AppLogo({ size = 40, className = "", priority = false }: Props) {
  return (
    <Image
      src="/tourism-center-logo.png"
      alt="Центр Туризма"
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
      priority={priority}
      unoptimized
    />
  );
}

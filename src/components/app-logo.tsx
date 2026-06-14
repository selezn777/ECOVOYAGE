import Image from "next/image";

type Props = {
  size?: number;
  className?: string;
  priority?: boolean;
};

export function AppLogo({ size = 40, className = "", priority = false }: Props) {
  return (
    <Image
      src="/ecovoyage-mark.png"
      alt="EcoVoyage"
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      priority={priority}
      unoptimized
    />
  );
}

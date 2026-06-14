/** Иконки для нижней мобильной навигации. Один стиль: viewBox 20x20, stroke=currentColor. */

type NavIconName =
  | "tours"
  | "tourists"
  | "cash"
  | "accounting"
  | "finance"
  | "rentals"
  | "salesPoints"
  | "tickets"
  | "team"
  | "report"
  | "employees"
  | "workday";

const sharedProps = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
} as const;

function ToursIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M12.6 7.4l-1.4 3.8-3.8 1.4 1.4-3.8 3.8-1.4z" strokeLinejoin="round" />
    </svg>
  );
}

function TouristsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M3.5 17c0-3.6 2.9-5.75 6.5-5.75s6.5 2.15 6.5 5.75" />
    </svg>
  );
}

function CashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <rect x="2" y="5" width="16" height="10" rx="2" />
      <circle cx="10" cy="10" r="2" />
      <path d="M5 8.2v3.6M15 8.2v3.6" />
    </svg>
  );
}

function AccountingIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <path d="M5.5 2.5h6l3 3v11a1 1 0 01-1 1h-8a1 1 0 01-1-1v-13a1 1 0 011-1z" />
      <path d="M11.5 2.5v3h3" />
      <path d="M6.8 9.5h6.4M6.8 12.2h6.4M6.8 14.9h4" />
    </svg>
  );
}

function FinanceIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <path d="M2.5 14.5l4-4.5 3 2.5 5-6.5 3 3.2" />
      <path d="M13.5 5.7H17.5V9.7" />
    </svg>
  );
}

function RentalsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <circle cx="7" cy="7" r="4" />
      <path d="M9.8 9.8L17 17M13 17l2.2-2.2M16 17l1.5-1.5" />
    </svg>
  );
}

function SalesPointsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <path d="M3 7.5l1-4.5h12l1 4.5" />
      <rect x="3" y="7.5" width="14" height="8.5" rx="1.5" />
      <path d="M8 16v-3a2 2 0 014 0v3" />
    </svg>
  );
}

function TicketsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <rect x="2.5" y="5.5" width="15" height="9" rx="1.8" />
      <path d="M12 5.5v9" strokeDasharray="1.6 1.8" />
      <path d="M5.5 8.4h3" />
    </svg>
  );
}

function TeamIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="14" cy="8" r="2" />
      <path d="M2.5 16.5c0-2.9 2-4.65 4.5-4.65s4.5 1.75 4.5 4.65" />
      <path d="M12.3 12.4c2 .15 3.7 1.6 3.7 4.1" />
    </svg>
  );
}

function ReportIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
      <path d="M6 13v-3M10 13V7M14 13V8.5" />
    </svg>
  );
}

function WorkdayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} {...props}>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" />
      <path d="M6.7 11.8l1.4 1.4 2.7-3" />
    </svg>
  );
}

const ICONS: Record<NavIconName, (props: React.SVGProps<SVGSVGElement>) => React.ReactNode> = {
  tours: ToursIcon,
  tourists: TouristsIcon,
  cash: CashIcon,
  accounting: AccountingIcon,
  finance: FinanceIcon,
  rentals: RentalsIcon,
  salesPoints: SalesPointsIcon,
  tickets: TicketsIcon,
  team: TeamIcon,
  report: ReportIcon,
  employees: TeamIcon,
  workday: WorkdayIcon,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name as NavIconName] ?? ToursIcon;
  return <Icon className={className} />;
}

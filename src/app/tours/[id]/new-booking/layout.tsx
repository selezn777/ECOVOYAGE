import { NewBookingDraftProvider } from "@/context/new-booking-draft-context";

export default async function NewBookingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NewBookingDraftProvider tourId={id}>{children}</NewBookingDraftProvider>;
}

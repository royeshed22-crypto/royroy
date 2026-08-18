export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      {children}
    </div>
  );
}

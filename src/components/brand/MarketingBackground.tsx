export function MarketingBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-25%,hsl(265_90%_40%/0.35),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_100%_0%,hsl(188_100%_40%/0.12),transparent_55%)]" />
      <div
        className="absolute inset-0 opacity-[0.22] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
        }}
      />
      <div className="absolute -left-32 top-24 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="absolute -right-24 bottom-20 h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />
      <div className="glow-line absolute bottom-0 left-0 right-0 h-px opacity-60" />
    </div>
  );
}

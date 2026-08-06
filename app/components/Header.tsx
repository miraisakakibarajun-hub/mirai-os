type HeaderProps = {
  organizationName?: string;
  userName?: string;
  environment?: "開発環境" | "検証環境" | "本番環境";
};

export default function Header({
  organizationName = "一般社団法人みらい",
  userName = "榊原 純",
  environment = "開発環境",
}: HeaderProps) {
  return (
    <header className="border-b border-[#A9824F]/40 bg-[#16233F] text-white">
      <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.24em] text-[#D8C4A5] sm:text-xs">
            MIRAI WELFARE MANAGEMENT SYSTEM
          </p>

          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-wide sm:text-2xl">
              MIRAI OS
            </h1>

            <span className="rounded-full border border-[#A9824F]/70 px-3 py-1 text-[10px] font-medium text-[#E2D1B5]">
              {environment}
            </span>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs text-white/60">{organizationName}</p>
          <p className="mt-1 text-sm font-medium text-white">{userName}</p>
        </div>
      </div>
    </header>
  );
}
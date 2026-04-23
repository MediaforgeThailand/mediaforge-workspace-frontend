interface PageLoadingAnimProps {
  label?: string;
}

const PageLoadingAnim = ({ label }: PageLoadingAnimProps) => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <img
        src="/loading.gif"
        alt="Loading"
        role="status"
        aria-label="Loading"
        className="w-64 h-64 md:w-96 md:h-96 object-contain"
      />
      {label && <p className="text-muted-foreground">{label}</p>}
    </div>
  </div>
);

export default PageLoadingAnim;

import "./App.css";

const CircularProgress = ({ percentage = 80 }) => {
  const radius = 44;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
        {/* Background Circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-muted/20"
        />
        {/* Progress Circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-accent transition-all duration-500 ease-in-out"
        />
      </svg>
      {/* Percentage Text */}
      <span className="absolute text-5xl font-bold text-foreground">
        {percentage}%
      </span>
    </div>
  );
};

export default function App() {
  return (
    <div className="w-full h-screen bg-primary-background flex flex-row">
      <div className="w-full h-1/2 flex items-center justify-center">
        <div className="bg-card w-3/4 h-3/4 rounded-2xl flex items-center justify-center">
          <div className="rounded-2xl bg-primary-foreground w-[90%] h-[90%] flex items-center justify-center p-2">
            <CircularProgress percentage={23} />
          </div>
        </div>
      </div>
    </div>
  )
}
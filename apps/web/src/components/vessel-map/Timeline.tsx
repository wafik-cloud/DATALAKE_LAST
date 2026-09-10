export default function Timeline({ progress, onChange }: { progress: number; onChange: (progress: number) => void }) {
  return (
    <input
      className="vessel-timeline"
      type="range"
      min="0"
      max="1"
      step="0.001"
      value={progress}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

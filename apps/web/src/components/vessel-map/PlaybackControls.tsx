import { PauseCircle, PlayCircle, RotateCcw, Square } from 'lucide-react';
import Timeline from './Timeline';

type Props = {
  playing: boolean;
  progress: number;
  speed: number;
  onPlayPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: number) => void;
  onProgressChange: (progress: number) => void;
};

export default function PlaybackControls({
  playing,
  progress,
  speed,
  onPlayPause,
  onStop,
  onRestart,
  onSpeedChange,
  onProgressChange,
}: Props) {
  return (
    <div className="vessel-playback">
      <button type="button" className="btn sm" onClick={onPlayPause}>
        {playing ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
        {playing ? 'Pause' : 'Lecture'}
      </button>
      <button type="button" className="btn sm" onClick={onStop}>
        <Square size={14} /> Stop
      </button>
      <button type="button" className="btn sm" onClick={onRestart}>
        <RotateCcw size={14} /> Recommencer
      </button>
      <select value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))}>
        {[1, 2, 5, 10, 20].map((value) => (
          <option key={value} value={value}>x{value}</option>
        ))}
      </select>
      <Timeline progress={progress} onChange={onProgressChange} />
    </div>
  );
}

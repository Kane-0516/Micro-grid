import './InfoBox.css';

interface InfoBoxProps {
  message: string;
}

export default function InfoBox({ message }: InfoBoxProps) {
  return (
    <div className="info-box">
      <div className="info-icon">i</div>
      <div className="info-content">
        <p>{message}</p>
      </div>
    </div>
  );
}

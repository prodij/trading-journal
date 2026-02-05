export default function Health() {
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>✅ Health Check</h1>
      <p>Server is running!</p>
      <p>Time: {new Date().toISOString()}</p>
      <p>Node: {process.version}</p>
    </div>
  );
}

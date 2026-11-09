import { createServer } from './app.js';

const PORT = process.env.PORT || 3001;
const { server } = createServer();

server.listen(PORT, () => {
  console.log(`Logzord Backend is running on port ${PORT}`);
});

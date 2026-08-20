import { server } from './app.js';

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Logzord Backend is running on port ${PORT}`);
});

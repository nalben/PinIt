require('dotenv').config();

const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/', routes);

app.get('/', (req, res) => {
  res.send('Backend работает на порту 3001');
});

const privateRoutes = require('./routes/private');
app.use('/api/private', privateRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на http://0.0.0.0:${PORT}`);
});

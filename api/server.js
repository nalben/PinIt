const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send({ message: 'Backend работает локально!' });
});

app.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});

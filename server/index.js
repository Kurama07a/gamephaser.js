const { Constants } = require("./constants");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketio(server);
app.use(cors());
app.use(express.static("dist"));

const getRndInteger = (min, max) => Math.floor(Math.random() * (max - min)) + min;

var numberOfConnectedUsers = 0;
var coin = { x: getRndInteger(50, Constants.WIDTH), y: getRndInteger(50, Constants.HEIGHT) };
var all_users = {};

io.on("connect", (socket) => {
  numberOfConnectedUsers++;
  socket.emit("to_new_user", { id: socket.id, coin: coin, others: all_users });

  socket.on("key_states", (keyStates) => {
    socket.broadcast.emit("player_key_states", { id: socket.id, keyStates });
  });

  socket.on("update_coordinates", (params, callback) => {
    const x = params.x;
    const y = params.y;
    const score = params.score;
    const name = params.name;
    const angle = params.angle;
    const bullets = params.bullets;
    all_users[socket.id] = { x, y, score, name, bullets, angle };
    socket.broadcast.emit("to_others", { id: socket.id, score, x, y, name, bullets, angle });
  });

  socket.on("shot", (p, c) => socket.broadcast.emit("other_shot"));

  socket.on("update_coin", (params, callback) => {
    coin = { x: params.x, y: params.y };
    socket.broadcast.emit("coin_changed", { coin });
  });

  socket.on("collision", (params, callback) => {
    socket.broadcast.emit("other_collision", {
      bullet_user_id: params.bullet_user_id,
      bullet_index: params.bullet_index,
      exploded_user_id: socket.id,
    });
  });

  socket.on("disconnect", () => {
    numberOfConnectedUsers--;
    socket.broadcast.emit("user_disconnected", { id: socket.id });
    delete all_users[socket.id];
  });
});

app.get("/health", (req, res) => res.send(`${process.env.NODE_ENV}`));

server.listen(8080, "0.0.0.0", () => {
  console.log("Server running on port 8080");
});
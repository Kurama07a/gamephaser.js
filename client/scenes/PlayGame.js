import Phaser from "phaser";
import Coin from "../assets/coin.svg";
import Spaceship from "../assets/spaceship.svg";
import BulletIcon from "../assets/bullet.svg";
import Bullets from "./Bullets";
import Explosion from "../assets/explosion.png";
import ExplosionSound from "../assets/exp.m4a";
import ShotSound from "../assets/shot.mp3";
import CoinSound from "../assets/coin_collect.wav";
import Constants from "../constants";
import io from "socket.io-client";

class PlayGame extends Phaser.Scene {
  init(name) {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      this.ENDPOINT = "gamephaserjs-production.up.railway.app";
    } else {
      this.ENDPOINT = "gamephaserjs-production.up.railway.app";
    }
    this.name = name;
    this.keys = this.input.keyboard.createCursorKeys();
    this.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.score = 0;
    this.others = {};
    this.x = Phaser.Math.Between(50, Constants.WIDTH - 50);
    this.y = Phaser.Math.Between(50, Constants.HEIGHT - 50);
  }

  preload() {
    this.load.spritesheet("boom", Explosion, { frameWidth: 64, frameHeight: 64, endFrame: 23 });
    this.load.image("coin", Coin);
    this.load.image("ship", Spaceship);
    this.load.image("bullet", BulletIcon);
    this.load.audio("explosion", ExplosionSound);
    this.load.audio("shot", ShotSound);
    this.load.audio("coin", CoinSound);
  }

  create() {
    var config = {
      key: "explode",
      frames: this.anims.generateFrameNumbers("boom", { start: 0, end: 23, first: 23 }),
      frameRate: 50,
    };
    this.explosion_sound = this.sound.add("explosion");
    this.shot_sound = this.sound.add("shot");
    this.coin_sound = this.sound.add("coin");
    this.anims.create(config);

    this.ship = this.get_new_spaceship(this.x, this.y, this.score, this.name, 0);
    this.socket = io(this.ENDPOINT);
    this.bullets = new Bullets(this);

    this.socket.on("to_new_user", (params, callback) => {
      this.id = params.id;
      this.others = params.others;
      for (const key of Object.keys(this.others)) {
        const x = this.others[key].x;
        const y = this.others[key].y;
        const score = this.others[key].score;
        const name = this.others[key].name;
        const angle = this.others[key].angle;
        const bullets = this.others[key].bullets;
        this.others[key].ship = this.get_new_spaceship(x, y, score, name, angle);
        this.others[key].bullets = this.get_enemy_bullets(bullets, key);
        this.others[key].score = score;
        this.others[key].name = name;
        this.check_for_winner(score);
      }
      this.coin = this.get_coin(params.coin.x, params.coin.y);
    });

    this.socket.on("to_others", (params, callback) => {
      const other_id = params.id;
      const other_x = params.x;
      const other_y = params.y;
      const score = params.score;
      const name = params.name;
      const angle = params.angle;
      const bullets = params.bullets;
      if (!(other_id in this.others)) {
        var ship = this.get_new_spaceship(other_x, other_y, score, name, angle);
        var others_bullets = this.get_enemy_bullets(bullets, other_id);
        this.others[other_id] = { x: other_x, y: other_y, ship: ship, bullets: others_bullets, score: score, name: name };
      } else {
        this.others[other_id].ship.cont.x = other_x;
        this.others[other_id].ship.cont.y = other_y;
        this.others[other_id].ship.score_text.setText(`${name}: ${score}`);
        this.others[other_id].ship.ship.setAngle(angle);
        this.update_enemy_bullets(other_id, bullets);
        this.others[other_id].score = score;
        this.others[other_id].name = name;
      }
      this.check_for_winner(score);
    });

    this.socket.on("coin_changed", (params, callback) => {
      this.coin_sound.play();
      this.coin.x = params.coin.x;
      this.coin.y = params.coin.y;
    });

    this.socket.on("other_collision", (params, callback) => {
      const other_id = params.bullet_user_id;
      const bullet_index = params.bullet_index;
      const exploded_user_id = params.exploded_user_id;
      this.bullets.children.entries[bullet_index].setVisible(false);
      this.bullets.children.entries[bullet_index].setActive(false);
      this.animate_explosion(exploded_user_id);
    });

    this.socket.on("other_shot", (p, c) => this.shot_sound.play());

    this.socket.on("user_disconnected", (params, callback) => {
      this.others[params.id].ship.score_text.destroy();
      this.others[params.id].ship.ship.destroy();
      this.others[params.id].ship.cont.destroy();
      delete this.others[params.id];
    });

    this.socket.on("player_key_states", (data) => this.handlePlayerKeyStates(data));

    this.keyStateInterval = setInterval(() => this.sendKeyStates(), 100);
  }

  sendKeyStates() {
    const keyStates = {
      up: this.keys.up.isDown,
      down: this.keys.down.isDown,
      left: this.keys.left.isDown,
      right: this.keys.right.isDown,
      space: this.space.isDown,
    };
    this.socket.emit("key_states", keyStates);
  }

  handlePlayerKeyStates(data) {
    const { id, keyStates } = data;
    const player = this.others[id];
    if (player) {
      const ship = player.ship.cont;
      const speed = 5;

      if (keyStates.up) player.targetY = ship.y - speed;
      if (keyStates.down) player.targetY = ship.y + speed;
      if (keyStates.left) player.targetX = ship.x - speed;
      if (keyStates.right) player.targetX = ship.x + speed;

      if (keyStates.up && keyStates.right) ship.setAngle(45);
      else if (keyStates.up && keyStates.left) ship.setAngle(-45);
      else if (keyStates.down && keyStates.right) ship.setAngle(135);
      else if (keyStates.down && keyStates.left) ship.setAngle(-135);
      else if (keyStates.up) ship.setAngle(0);
      else if (keyStates.down) ship.setAngle(180);
      else if (keyStates.left) ship.setAngle(270);
      else if (keyStates.right) ship.setAngle(90);
    }
  }

  predictLocalMovement() {
    const ship = this.ship.cont;
    const speed = 5;

    if (this.keys.up.isDown) ship.y -= speed;
    if (this.keys.down.isDown) ship.y += speed;
    if (this.keys.left.isDown) ship.x -= speed;
    if (this.keys.right.isDown) ship.x += speed;

    if (this.keys.up.isDown && this.keys.right.isDown) ship.setAngle(45);
    else if (this.keys.up.isDown && this.keys.left.isDown) ship.setAngle(-45);
    else if (this.keys.down.isDown && this.keys.right.isDown) ship.setAngle(135);
    else if (this.keys.down.isDown && this.keys.left.isDown) ship.setAngle(-135);
    else if (this.keys.up.isDown) ship.setAngle(0);
    else if (this.keys.down.isDown) ship.setAngle(180);
    else if (this.keys.left.isDown) ship.setAngle(270);
    else if (this.keys.right.isDown) ship.setAngle(90);
  }

  interpolatePlayerPositions() {
    for (const id of Object.keys(this.others)) {
      const player = this.others[id];
      const ship = player.ship.cont;
      if (player.targetX !== undefined) ship.x = Phaser.Math.Linear(ship.x, player.targetX, 0.2);
      if (player.targetY !== undefined) ship.y = Phaser.Math.Linear(ship.y, player.targetY, 0.2);
    }
  }

  update() {
    this.predictLocalMovement();
    this.interpolatePlayerPositions();
    if (Phaser.Input.Keyboard.JustDown(this.space)) {
      this.bullets.fireBullet(this.ship.cont.x, this.ship.cont.y - 5, this.ship.ship.angle, () => {
        this.socket.emit("shot");
        this.shot_sound.play();
      });
    }
  }

  get_new_spaceship(x, y, score, name, angle) {
    var score_text = this.add.text(-30, 25, `${name}: ${score}`, { color: "#00ff00", align: "center", fontSize: "13px" });
    var ship = this.add.sprite(0, 0, "ship");
    ship.setAngle(angle);
    var cont = this.add.container(x, y, [ship, score_text]);
    cont.setSize(45, 45);
    this.physics.add.existing(cont, false);
    this.physics.add.existing(ship, false);
    cont.body.setCollideWorldBounds(true);
    return { score_text, ship, cont };
  }

  get_coin(x, y) {
    var coin = this.add.sprite(x, y, "coin");
    this.physics.add.existing(coin, false);
    this.physics.add.collider(coin, this.ship.ship, this.fire, null, this);
    return coin;
  }

  fire(coin) {
    this.coin_sound.play();
    coin.x = Phaser.Math.Between(20, Constants.WIDTH - 20);
    coin.y = Phaser.Math.Between(20, Constants.HEIGHT - 20);
    this.score += 5;
    this.ship.score_text.setText(`${this.name}: ${this.score}`);
    this.socket.emit("update_coin", { x: coin.x, y: coin.y });
    this.check_for_winner(this.score);
  }

  get_enemy_bullets(bullets, id) {
    var enemy_bullets = new Bullets(this);
    for (let i = 0; i < bullets.length; i++) {
      enemy_bullets.children.entries[i].setAngle(bullets[i].angle);
      enemy_bullets.children.entries[i].setActive(bullets[i].active);
      enemy_bullets.children.entries[i].setVisible(bullets[i].visible);
      enemy_bullets.children.entries[i].x = bullets[i].x;
      enemy_bullets.children.entries[i].y = bullets[i].y;
      this.physics.add.collider(enemy_bullets.children.entries[i], this.ship.ship, (bullet) => {
        if (!bullet.disabled) {
          this.emmit_collision(id, i);
          bullet.disabled = true;
          enemy_bullets.children.entries[i].setActive(false);
          this.animate_explosion("0");
        } else {
          setTimeout(() => {
            bullet.disabled = false;
          }, 100);
        }
      }, null, this);
    }
    return enemy_bullets;
  }

  update_enemy_bullets(id, bullets) {
    var bullet_sprites = this.others[id].bullets;
    for (var i = 0; i < bullets.length; i++) {
      bullet_sprites.children.entries[i].x = bullets[i].x;
      bullet_sprites.children.entries[i].y = bullets[i].y;
      bullet_sprites.children.entries[i].setAngle(bullets[i].angle);
      bullet_sprites.children.entries[i].setActive(bullets[i].active);
      bullet_sprites.children.entries[i].setVisible(bullets[i].visible);
    }
  }

  emmit_collision(bullet_user_id, bullet_index) {
    this.socket.emit("collision", { bullet_user_id, bullet_index });
  }

  animate_explosion(id) {
    var ship;
    if (id === "0") {
      ship = this.ship.cont;
      ship.setActive(false);
      this.score = Math.max(0, this.score - 2);
      this.ship.score_text.setText(`${this.name}: ${this.score}`);
      setTimeout(() => {
        ship.setActive(true);
      }, 1000);
    } else {
      ship = this.others[id].ship.cont;
    }
    var boom = this.add.sprite(ship.x, ship.y, "boom");
    boom.anims.play("explode");
    this.explosion_sound.play();
  }

  check_for_winner(score) {
    if (score >= Constants.POINTS_TO_WIN) {
      let players = [{ name: this.name, score: this.score }];
      for (let other in this.others) {
        players.push({ name: this.others[other].name, score: this.others[other].score });
      }
      players = players.sort((a, b) => b.score - a.score);
      setTimeout(() => this.socket.disconnect(), 20);
      this.scene.start("winner", players);
    }
  }
}

export default PlayGame;
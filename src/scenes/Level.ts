// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
import { Client, Room, getStateCallbacks } from "colyseus.js";
/* END-USER-IMPORTS */

export default class Level extends Phaser.Scene {
  constructor() {
    super("Level");

    /* START-USER-CTR-CODE */
    // Write your code here.
    /* END-USER-CTR-CODE */
  }

  editorCreate(): void {
    this.events.emit("scene-awake");
  }

  /* START-USER-CODE */

  // Write your code here

  client: Client = new Client("ws://localhost:2567");
  room: Room;
  playerEntities: { [sessionId: string]: any } = {};
  inputPayload: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
  } = {
    left: false,
    right: false,
    up: false,
    down: false,
  };
  cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
  currentPlayer: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  localRef: Phaser.GameObjects.Rectangle;
  remoteRef: Phaser.GameObjects.Rectangle;
  elapsedTime: number = 0;
  fixedTimeStep: number = 1000 / 60;

  preload() {
    this.cursorKeys = this.input.keyboard!.createCursorKeys();
  }

  async create() {
    this.editorCreate();

    try {
      this.room = await this.client.joinOrCreate("my_room");
      console.log("Joined successfully!");

      const $ = getStateCallbacks(this.room);

      $(this.room.state).players.onAdd((player: any, sessionId: string) => {
        const entity = this.physics.add.image(player.x, player.y, "ship_0001");

        // keep a reference of it on `playerEntities`
        this.playerEntities[sessionId] = entity;

        if (sessionId === this.room.sessionId) {
          // this is the current player!
          // (we are going to treat it differently during the update loop)
          this.currentPlayer = entity;

          // localRef is being used for debug only
          this.localRef = this.add.rectangle(0, 0, entity.width, entity.height);
          this.localRef.setStrokeStyle(1, 0x00ff00);

          // remoteRef is being used for debug only
          this.remoteRef = this.add.rectangle(
            0,
            0,
            entity.width,
            entity.height
          );
          this.remoteRef.setStrokeStyle(1, 0xff0000);

          $(player).onChange(() => {
            this.remoteRef.x = player.x;
            this.remoteRef.y = player.y;
          });
        } else {
          // all remote players are here!
          // (same as before, we are going to interpolate remote players)
          $(player).onChange(() => {
            // entity.x = player.x;
            // entity.y = player.y;

            entity.setData("serverX", player.x);
            entity.setData("serverY", player.y);
          });
        }
      });

      $(this.room.state).players.onRemove((_player, sessionId: string) => {
        const entity = this.playerEntities[sessionId];

        if (entity) {
          entity.destroy();
          delete this.playerEntities[sessionId];
        }
      });
    } catch (e) {
      console.error(e);
    }
  }

  update(time: number, delta: number) {
    // skip loop if not connected with room yet.
    if (!this.room) {
      return;
    }

    // skip loop if not connected yet.
    if (!this.currentPlayer) {
      return;
    }

    this.elapsedTime += delta;
    while (this.elapsedTime >= this.fixedTimeStep) {
      this.elapsedTime -= this.fixedTimeStep;
      this.fixedTick(time, this.fixedTimeStep);
    }
  }

  fixedTick(_time: number, _delta: number) {
    // send input to the server
    this.inputPayload.left = this.cursorKeys.left.isDown;
    this.inputPayload.right = this.cursorKeys.right.isDown;
    this.inputPayload.up = this.cursorKeys.up.isDown;
    this.inputPayload.down = this.cursorKeys.down.isDown;
    this.room.send(0, this.inputPayload);

    this.localRef.x = this.currentPlayer.x;
    this.localRef.y = this.currentPlayer.y;

    // Moving the local player instantly
    //
    // We need to implement in the client-side the same logic we already have
    // on the server-side for player movement.
    //
    // Instead of waiting for the acknowledgement of the server, we apply the
    // position change locally at exactly the same instant as sending the input
    // to the server:
    const velocity = 2;

    if (this.inputPayload.left) {
      this.currentPlayer.x -= velocity;
    } else if (this.inputPayload.right) {
      this.currentPlayer.x += velocity;
    }

    if (this.inputPayload.up) {
      this.currentPlayer.y -= velocity;
    } else if (this.inputPayload.down) {
      this.currentPlayer.y += velocity;
    }

    // interpolate all player entities
    for (let sessionId in this.playerEntities) {
      // do not interpolate the current player
      if (sessionId === this.room.sessionId) {
        continue;
      }

      // interpolate all other player entities
      const entity = this.playerEntities[sessionId];
      const { serverX, serverY } = entity.data.values;

      // The third argument of Phaser.Math.Linear is the percentage value. You
      // may want to adjust it for your own needs. It accepts from 0 to 1. The
      // higher it is, the faster the interpolation is going to happen.
      entity.x = Phaser.Math.Linear(entity.x, serverX, 0.1);
      entity.y = Phaser.Math.Linear(entity.y, serverY, 0.1);
    }
  }

  /* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here

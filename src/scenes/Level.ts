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

        $(player).onChange(() => {
          entity.x = player.x;
          entity.y = player.y;
        });
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

  update(_time: number, _delta: number) {
    // skip loop if not connected with room yet.
    if (!this.room) {
      return;
    }

    // send input to the server
    this.inputPayload.left = this.cursorKeys.left.isDown;
    this.inputPayload.right = this.cursorKeys.right.isDown;
    this.inputPayload.up = this.cursorKeys.up.isDown;
    this.inputPayload.down = this.cursorKeys.down.isDown;
    this.room.send(0, this.inputPayload);
  }

  /* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here

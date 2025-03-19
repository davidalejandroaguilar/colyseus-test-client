// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
import { Client, Room } from "colyseus.js";
/* END-USER-IMPORTS */

export default class Level extends Phaser.Scene {
  constructor() {
    super("Level");

    /* START-USER-CTR-CODE */
    // Write your code here.
    /* END-USER-CTR-CODE */
  }

  editorCreate(): void {
    // fufuSuperDino
    this.add.image(640, 257, "FufuSuperDino");

    // text
    const text = this.add.text(640, 458, "", {});
    text.setOrigin(0.5, 0.5);
    text.text = "Phaser 3 + Phaser Editor v4\nVite + TypeScript";
    text.setStyle({ align: "center", fontFamily: "Arial", fontSize: "3em" });

    this.events.emit("scene-awake");
  }

  /* START-USER-CODE */

  // Write your code here

  client = new Client("ws://localhost:2567");
  room: Room;

  async create() {
    this.editorCreate();

    try {
      this.room = await this.client.joinOrCreate("my_room");
      console.log("Joined successfully!");
    } catch (e) {
      console.error(e);
    }
  }

  /* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here

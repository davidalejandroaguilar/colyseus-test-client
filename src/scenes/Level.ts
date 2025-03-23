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
    tick: number;
  } = {
    left: false,
    right: false,
    up: false,
    down: false,
    tick: 0,
  };
  cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
  currentPlayer: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  localRef: Phaser.GameObjects.Rectangle;
  remoteRef: Phaser.GameObjects.Rectangle;
  elapsedTime: number = 0;
  fixedTimeStep: number = 1000 / 60;
  currentTick: number = 0;
  // Track inputs and positions for reconciliation
  inputHistory: {
    input: {
      left: boolean;
      right: boolean;
      up: boolean;
      down: boolean;
      tick: number;
    };
    position: {
      x: number;
      y: number;
    };
  }[] = [];
  // Maximum history size to prevent memory leaks
  MAX_HISTORY_SIZE: number = 100;
  // Reconciliation threshold in pixels
  RECONCILIATION_THRESHOLD: number = 5;
  // Whether reconciliation is in progress
  isReconciling: boolean = false;
  // Debug text for reconciliation status
  debugText: Phaser.GameObjects.Text;
  velocity: number = 2;

  preload() {
    this.cursorKeys = this.input.keyboard!.createCursorKeys();
  }

  async create() {
    this.editorCreate();

    try {
      this.room = await this.client.joinOrCreate("my_room");
      console.log("Joined successfully!");

      // Add debug text
      this.debugText = this.add.text(10, 10, "Reconciliation: Idle", {
        color: "#ffffff",
        fontSize: "16px",
      });

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

            // Check for position discrepancy and reconcile if needed
            this.checkReconciliation(player);
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

  /**
   * Checks if the client's position has diverged from the server's authoritative position.
   * If the difference is significant, performs reconciliation by resetting to server position
   * and replaying unprocessed inputs. If the difference is small, applies a subtle correction.
   *
   * @param playerServerState - The server's authoritative player state
   */
  checkReconciliation(playerServerState: any) {
    // Only check if not already reconciling
    if (this.isReconciling) return;

    // Calculate the Euclidean distance between client's position and server's position
    // This measures how far our local player has drifted from where the server thinks we are
    const distance = Phaser.Math.Distance.Between(
      this.currentPlayer.x, // Client's current x position
      this.currentPlayer.y, // Client's current y position
      playerServerState.x, // Server's authoritative x position
      playerServerState.y // Server's authoritative y position
    );

    // If distance exceeds threshold, perform full reconciliation
    if (distance > this.RECONCILIATION_THRESHOLD) {
      this.debugText.setText(
        `Reconciliation: Active (${distance.toFixed(2)}px difference)`
      );
      this.isReconciling = true;

      // Find the input that corresponds to the server's last processed tick
      // This is important because:
      // 1. The server's position is based on inputs it has processed up to a certain tick
      // 2. We need to know which inputs have already been processed by the server
      // 3. Any inputs sent after this tick need to be replayed after reconciliation
      const serverTick = playerServerState.tick;
      const matchingHistoryIndex = this.inputHistory.findIndex(
        (item) => item.input.tick === serverTick
      );

      if (matchingHistoryIndex !== -1) {
        // Reset player position to match server's authoritative position
        this.currentPlayer.x = playerServerState.x;
        this.currentPlayer.y = playerServerState.y;

        // Remove all entries up to and including the match
        // (we don't need inputs the server has already processed)
        this.inputHistory = this.inputHistory.slice(matchingHistoryIndex + 1);

        // Replay all inputs that the server hasn't processed yet
        // This ensures we don't lose responsive movement while waiting for server update
        this.replayInputs();
      } else {
        // If no matching tick found (rare case), just snap to server position
        // This can happen if there was a disconnect or if we have limited history
        this.currentPlayer.x = playerServerState.x;
        this.currentPlayer.y = playerServerState.y;
        this.inputHistory = [];
      }

      this.isReconciling = false;

      // Reset debug text after 2 seconds
      this.time.delayedCall(2000, () => {
        this.debugText.setText("Reconciliation: Idle");
      });
    } else if (distance > 0) {
      // Apply soft correction when below threshold but not exactly matching
      // This prevents gradual drift while keeping movements smooth

      // Calculate correction strength based on how close we are to the threshold
      // - Small discrepancies get tiny corrections
      // - Larger discrepancies (approaching threshold) get stronger corrections
      // - We cap at 0.1 (10%) to ensure movements always feel smooth
      const correctionStrength = Math.min(
        0.1,
        distance / (this.RECONCILIATION_THRESHOLD * 2)
      );

      // Linear interpolation moves us a percentage of the way (correctionStrength)
      // toward the server position. This is imperceptible to the player but
      // prevents small errors from accumulating over time.
      this.currentPlayer.x = Phaser.Math.Linear(
        this.currentPlayer.x, // Current client position
        playerServerState.x, // Target server position
        correctionStrength // How much to move toward target (0.0 to 0.1)
      );
      this.currentPlayer.y = Phaser.Math.Linear(
        this.currentPlayer.y,
        playerServerState.y,
        correctionStrength
      );

      // Update debug text occasionally when soft correction is happening
      // We don't update every frame to avoid text flickering
      if (Math.random() < 0.05) {
        // Only update ~5% of the time
        this.debugText.setText(`Soft Correction: ${distance.toFixed(2)}px`);

        // Reset after a short delay
        this.time.delayedCall(500, () => {
          this.debugText.setText("Reconciliation: Idle");
        });
      }
    }
    // If distance is exactly 0, no correction is needed - client and server agree perfectly
  }

  /**
   * Replays all inputs in the history that haven't been processed by the server yet.
   * This is called after reconciliation to ensure player movement remains responsive
   * even while waiting for server confirmation.
   */
  replayInputs() {
    // Apply each stored input in sequence to rebuild the client position
    for (const entry of this.inputHistory) {
      const input = entry.input;

      // Apply the same movement logic used in fixedTick
      if (input.left) {
        this.currentPlayer.x -= this.velocity;
      } else if (input.right) {
        this.currentPlayer.x += this.velocity;
      }

      if (input.up) {
        this.currentPlayer.y -= this.velocity;
      } else if (input.down) {
        this.currentPlayer.y += this.velocity;
      }
    }
  }

  fixedTick(_time: number, _delta: number) {
    this.currentTick++;

    const currentPlayerRemote = this.room.state.players.get(
      this.room.sessionId
    );
    const ticksBehind = this.currentTick - currentPlayerRemote.tick;
    console.log({ ticksBehind });

    // Record player position before input
    // We store this to enable rolling back to previous positions during reconciliation
    const previousPosition = {
      x: this.currentPlayer.x,
      y: this.currentPlayer.y,
    };

    // send input to the server
    this.inputPayload.left = this.cursorKeys.left.isDown;
    this.inputPayload.right = this.cursorKeys.right.isDown;
    this.inputPayload.up = this.cursorKeys.up.isDown;
    this.inputPayload.down = this.cursorKeys.down.isDown;
    this.inputPayload.tick = this.currentTick;
    this.room.send("move", this.inputPayload);

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

    if (this.inputPayload.left) {
      this.currentPlayer.x -= this.velocity;
    } else if (this.inputPayload.right) {
      this.currentPlayer.x += this.velocity;
    }

    if (this.inputPayload.up) {
      this.currentPlayer.y -= this.velocity;
    } else if (this.inputPayload.down) {
      this.currentPlayer.y += this.velocity;
    }

    // Store input and position in history if not reconciling
    // This history allows us to replay inputs after reconciliation
    if (!this.isReconciling) {
      this.inputHistory.push({
        input: { ...this.inputPayload },
        position: previousPosition,
      });

      // Limit history size to prevent memory leaks
      if (this.inputHistory.length > this.MAX_HISTORY_SIZE) {
        this.inputHistory.shift();
      }
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

/**
 * Role: Reserver
 * Reserves remote room controllers to boost energy regeneration and mark territory
 *
 * CONSOLE COMMANDS TO USE:
 *
 * 1. Add remote room to monitor (replace 'W1N1' with actual adjacent room name):
 *    Memory.remoteRooms = ['W1N1'];
 *
 * 2. Spawn first reserver manually (replace room name and spawn name):
 *    Game.spawns['Spawn1'].spawnCreep([CLAIM, CLAIM, MOVE, MOVE], 'Reserver1', {
 *        memory: {role: 'reserver', targetRoom: 'W1N1', fixedRole: true}
 *    });
 *
 * 3. After first reserver arrives, auto-spawn kicks in based on reservation timer
 *
 * Note: Reservation adds +10 energy/tick to sources and lasts up to 5000 ticks
 */

var roleReserver = {
    /** @param {Creep} creep **/
    run: function (creep) {
        const targetRoom = creep.memory.targetRoom;
        if (!targetRoom) {
            console.log(`Reserver ${creep.name} has no targetRoom set!`);
            return;
        }

        // Track spawn time for travel time calculation
        if (!creep.memory.spawnTick) {
            creep.memory.spawnTick = Game.time;
        }

        // If not in target room yet, move there
        if (creep.room.name !== targetRoom) {
            const targetPos = new RoomPosition(25, 25, targetRoom);
            creep.moveTo(targetPos, {
                visualizePathStyle: { stroke: "#00ffff" },
                reusePath: 50,
            });
            creep.say("🚀");
            return;
        }

        // In target room, find controller
        const controller = creep.room.controller;
        if (!controller) {
            console.log(`No controller in room ${targetRoom}`);
            return;
        }

        // Record arrival time on first arrival (for travel time calculation)
        if (!creep.memory.arrivalTick && creep.pos.inRangeTo(controller, 1)) {
            creep.memory.arrivalTick = Game.time;
            const actualTravelTime =
                creep.memory.arrivalTick - creep.memory.spawnTick;

            // Store travel time in memory for future reservers
            Memory.remotePaths = Memory.remotePaths || {};
            Memory.remotePaths[targetRoom] =
                Memory.remotePaths[targetRoom] || {};
            Memory.remotePaths[targetRoom].travelTime = actualTravelTime;

            console.log(
                `Reserver ${creep.name} reached ${targetRoom} in ${actualTravelTime} ticks`,
            );
        }

        // Reserve controller
        const result = creep.reserveController(controller);
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller, {
                visualizePathStyle: { stroke: "#00ffff" },
                reusePath: 20,
            });
            creep.say("🏃");
        } else if (result === OK) {
            creep.say("🔒");
        } else if (result === ERR_INVALID_TARGET) {
            // Already reserved by us or owned - nothing to do
            creep.say("✅");
        } else {
            console.log(`Reserver ${creep.name} reserve error: ${result}`);
        }

        // If reservation is maxed, suicide to recycle body
        if (
            controller.reservation &&
            controller.reservation.ticksToEnd >= 4999
        ) {
            console.log(
                `Reserver ${creep.name} completed reservation, recycling`,
            );
            creep.suicide();
        }
    },
};

module.exports = roleReserver;

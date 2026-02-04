/**
 * Role: Attacker
 * Moves to target room and engages hostile creeps.
 */

var roleAttacker = {
    /** @param {Creep} creep **/
    run: function (creep) {
        const targetRoom = creep.memory.targetRoom;
        if (!targetRoom) {
            console.log(`Attacker ${creep.name} has no targetRoom set!`);
            return;
        }

        if (creep.room.name !== targetRoom) {
            const targetPos = new RoomPosition(25, 25, targetRoom);
            creep.moveTo(targetPos, {
                visualizePathStyle: { stroke: "#ff0000" },
                reusePath: 50,
            });
            return;
        }

        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            const target = creep.pos.findClosestByPath(hostiles);
            if (target) {
                if (creep.attack(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ff0000" },
                        reusePath: 20,
                    });
                }
            }
        } else {
            // No hostiles - wait in the center of the room
            const centerPos = new RoomPosition(25, 25, targetRoom);
            if (creep.pos.getRangeTo(centerPos) > 0) {
                creep.moveTo(centerPos, {
                    visualizePathStyle: { stroke: "#ff0000" },
                    reusePath: 50,
                });
            }
        }
    },
};

module.exports = roleAttacker;

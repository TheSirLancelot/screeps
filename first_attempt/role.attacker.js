/**
 * Role: Attacker
 * Moves to target room and engages hostile creeps.
 * NOTE: Attackers should NOT build roads or structures - this is a combat role only
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
        const invaderCores = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) =>
                structure.structureType === STRUCTURE_INVADER_CORE,
        });

        // Attack invader cores if present (priority), otherwise attack hostiles
        const target =
            invaderCores.length > 0
                ? creep.pos.findClosestByPath(invaderCores)
                : hostiles.length > 0
                  ? creep.pos.findClosestByPath(hostiles)
                  : null;

        if (target) {
            // Try melee attack first (1 tile range)
            const meleeResult = creep.attack(target);

            if (meleeResult === ERR_NOT_IN_RANGE) {
                // Out of melee range - try ranged attack (3 tile range) while moving closer
                const rangedResult = creep.rangedAttack(target);

                // Move toward target either way
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: "#ff0000" },
                    reusePath: 20,
                });

                if (rangedResult === OK) {
                    creep.say("🎯");
                }
            } else if (meleeResult === OK) {
                creep.say("⚔️");
            }
        } else {
            // No targets - wait in the center of the room
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

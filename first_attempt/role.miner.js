/**
 * Dedicated Miner Role
 * Parks on a source and harvests continuously, feeding a nearby container if present.
 */

var roleMiner = {
    /** @param {Creep} creep **/
    run: function (creep) {
        const roomMem = (Memory.rooms[creep.room.name] =
            Memory.rooms[creep.room.name] || {});
        roomMem.sourceAssignments = roomMem.sourceAssignments || {};

        // Clear stale assignments when a miner dies
        for (const sourceId in roomMem.sourceAssignments) {
            const assignedName = roomMem.sourceAssignments[sourceId];
            if (!Game.creeps[assignedName]) {
                delete roomMem.sourceAssignments[sourceId];
            }
        }

        // Ensure this miner is assigned to exactly one unclaimed source
        let assignedSourceId = creep.memory.sourceId;
        if (assignedSourceId) {
            const assignedTo = roomMem.sourceAssignments[assignedSourceId];
            if (assignedTo && assignedTo !== creep.name) {
                // Source already claimed by another miner; clear and reassign
                assignedSourceId = null;
                creep.memory.sourceId = null;
            }
        }

        if (!assignedSourceId) {
            const sources = creep.room.find(FIND_SOURCES);
            // Find an unassigned source (or reclaim if this miner was the assignment)
            let target = null;
            for (let i = 0; i < sources.length; i += 1) {
                const source = sources[i];
                const assignedTo = roomMem.sourceAssignments[source.id];
                if (!assignedTo || assignedTo === creep.name) {
                    target = source;
                    break;
                }
            }

            if (!target && sources.length > 0) {
                // If all sources are assigned (e.g., two miners spawned same tick),
                // pick the source with the farthest assigned miner to reduce collisions.
                let bestSource = sources[0];
                let bestDistance = -1;
                for (let i = 0; i < sources.length; i += 1) {
                    const source = sources[i];
                    const assignedName = roomMem.sourceAssignments[source.id];
                    const assignedCreep = assignedName
                        ? Game.creeps[assignedName]
                        : null;
                    const distance = assignedCreep
                        ? creep.pos.getRangeTo(assignedCreep)
                        : 0;
                    if (distance > bestDistance) {
                        bestDistance = distance;
                        bestSource = source;
                    }
                }
                target = bestSource;
            }

            if (target) {
                roomMem.sourceAssignments[target.id] = creep.name;
                creep.memory.sourceId = target.id;
                assignedSourceId = target.id;
            }
        } else {
            // Ensure assignment stays consistent
            roomMem.sourceAssignments[assignedSourceId] = creep.name;
        }

        const source = creep.memory.sourceId
            ? Game.getObjectById(creep.memory.sourceId)
            : null;
        if (!source) {
            return;
        }

        // Prefer standing on a container adjacent to the source (with free capacity)
        const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: (structure) =>
                structure.structureType === STRUCTURE_CONTAINER,
        });
        const openContainers = containers.filter(
            (container) => container.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
        );
        const targetContainer = openContainers.length
            ? creep.pos.findClosestByRange(openContainers) || openContainers[0]
            : containers[0] || null;

        if (targetContainer && !creep.pos.isEqualTo(targetContainer.pos)) {
            creep.moveTo(targetContainer, { reusePath: 50 });
            return;
        }

        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { reusePath: 50 });
            return;
        }

        if (
            targetContainer &&
            targetContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
            creep.store[RESOURCE_ENERGY] > 0
        ) {
            creep.transfer(targetContainer, RESOURCE_ENERGY);
        } else if (
            openContainers.length === 0 &&
            creep.store.getFreeCapacity() === 0
        ) {
            creep.drop(RESOURCE_ENERGY);
        }
    },
};

module.exports = roleMiner;

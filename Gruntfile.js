module.exports = function (grunt) {
    grunt.loadNpmTasks("grunt-screeps");

    grunt.initConfig({
        screeps: {
            options: {
                email: "williamweir10@gmail.com",
                password: process.env.SCREEPS_PASSWORD,
                branch: "first_attempt",
                server: {
                    host: "screeps.newbieland.net",
                    port: 21025,
                    http: true,
                },
            },
            dist: {
                src: ["first_attempt/*.js"],
            },
        },
    });

    grunt.registerTask("default", ["screeps"]);
};

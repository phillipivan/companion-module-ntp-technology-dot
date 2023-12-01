const { combineRgb } = require('@companion-module/base')
const { paramSep, nullParam, SOM, control, appTag } = require('./consts.js')

module.exports = async function (self) {
	self.setFeedbackDefinitions({
		checkCrosspoint: {
			name: 'Check Crosspoint',
			type: 'boolean',
			label: 'Check Crosspoint',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'src',
					type: 'dropdown',
					label: 'sources',
					default: 1,
					choices: self.sources,
				},
				{
					id: 'dst',
					type: 'dropdown',
					label: 'Destination',
					default: 1,
					choices: self.destinations,
				},
			],
			callback: ({ options }) => {
				if (self.connections[options.dst] == options.src) {
					return true
				} else {
					return false
				}
			},
			subscribe: async ({ options }) => {
				let cmd = SOM + control.reqInterrogate + appTag.crosspoint + options.dst + paramSep + nullParam
				self.addCmdtoQueue(cmd)
			},
		},
	})
}
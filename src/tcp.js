import { InstanceStatus, TCPHelper } from '@companion-module/base'
import PQueue from 'p-queue'
import delay from 'delay'
import { EndSession, msgDelay, SOM, EOM, keepAliveInterval, control, appTag, paramSep } from './consts.js'
const queue = new PQueue({ concurrency: 1, interval: msgDelay, intervalCap: 1 })

export async function addCmdtoQueue(cmd) {
	if (cmd !== undefined && cmd.length > 5) {
		if (this.cmdQueue.includes(cmd) === false) {
			this.cmdQueue.push(cmd)
			return await queue.add(async () => {
				while (!this.clearToTx) {
					await delay(10)
				}
				this.cmdQueue = this.cmdQueue.splice(this.cmdQueue.indexOf(cmd), 1)
				return await this.sendCommand(cmd)
			})
		} else {
			this.log('debug', `${cmd} already in queue, discarding`)
			return false
		}
	}
	this.log('warn', `Invalid command: ${cmd}`)
	return false
}

export async function sendCommand(cmd) {
	if (cmd !== undefined) {
		if (this.socket !== undefined && this.socket.isConnected) {
			this.log('debug', `Sending Command: ${cmd}`)
			this.clearToTx = false
			return await this.socket.send(cmd + EOM)
		} else {
			this.log('warn', `Socket not connected, tried to send: ${cmd}`)
		}
	} else {
		this.log('warn', 'Command undefined')
	}
	return false
}

//queries made on initial connection.
export async function queryOnConnect() {
	//request crosspoint notications
	await this.addCmdtoQueue(SOM + control.reqNotification + appTag.crosspoint + 1 + paramSep + 1)
	//request alive notifications
	await this.addCmdtoQueue(SOM + control.reqNotification + appTag.alive + 1 + paramSep + 0)
	//request alarm notifications
	await this.addCmdtoQueue(SOM + control.reqNotification + appTag.alarm + 1 + paramSep + 1)
	//make sure all feedbacks are accurate
	this.subscribeFeedbacks()
	return true
}

export function keepAlive() {
	//request alive notifications
	this.addCmdtoQueue(SOM + control.reqNotification + appTag.alive + 1 + paramSep + 0).catch(() => {})
	this.keepAliveTimer = setTimeout(() => {
		this.keepAlive()
	}, keepAliveInterval)
}

export async function initTCP() {
	this.receiveBuffer = ''
	if (this.socket !== undefined && !this.socket.isDestroyed) {
		await this.sendCommand(EndSession)
		this.socket.destroy()
	}
	if (this.config.hostPri && this.config.portPri) {
		this.log('debug', 'Creating New Socket')
		if (this.useSecondary && this.config.hostSec && this.config.portSec) {
			this.updateStatus(InstanceStatus.Connecting, 'Connecting to Secondary')
			this.socket = new TCPHelper(this.config.hostSec, this.config.portSec)
		} else {
			this.updateStatus(InstanceStatus.Connecting, 'Connecting to Primary')
			this.socket = new TCPHelper(this.config.hostPri, this.config.portPri)
		}
		this.socket.on('status_change', (status, message) => {
			this.updateStatus(status, message)
		})
		this.socket.on('error', (err) => {
			this.log('error', `Network error: ${err.message}`)
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
			this.clearToTx = true
			clearTimeout(this.keepAliveTimer)
			if (this.config.redundant) {
				this.useSecondary = !this.useSecondary
				this.initTCP()
			}
		})
		this.socket.on('connect', () => {
			if (this.useSecondary && this.config.hostSec) {
				this.log('info', `Connected on Secondary ${this.config.hostSec}:${this.config.portSec}`)
				this.updateStatus(InstanceStatus.Ok, `Connected to Secondary`)
			} else {
				this.log('info', `Connected on Primary ${this.config.hostPri}:${this.config.portPri}`)
				this.updateStatus(InstanceStatus.Ok, `Connected to Primary`)
			}
			this.clearToTx = true
			this.receiveBuffer = ''
			this.queryOnConnect()
			this.keepAliveTimer = setTimeout(() => {
				this.keepAlive()
			}, keepAliveInterval)
		})
		this.socket.on('data', (chunk) => {
			this.clearToTx = true
			let i = 0,
				line = '',
				offset = 0
			this.receiveBuffer += chunk
			while ((i = this.receiveBuffer.indexOf(EOM, offset)) !== -1) {
				line = this.receiveBuffer.substring(offset, i)
				offset = i + 1
				this.processCmd(line.toString())
			}
			this.receiveBuffer = this.receiveBuffer.substring(offset)
		})
	} else {
		this.updateStatus(InstanceStatus.BadConfig)
	}
}

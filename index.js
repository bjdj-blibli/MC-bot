const mineflayer = require('mineflayer')
const pvp = require('mineflayer-pvp').plugin
const pathfinder = require('mineflayer-pathfinder').pathfinder
const Movements = require('mineflayer-pathfinder').Movements
const { GoalBlock } = require('mineflayer-pathfinder').goals
const armorManager = require('mineflayer-armor-manager')
const fs = require('fs')
const path = require('path')

// 白名单文件路径
const WHITELIST_FILE = path.join(__dirname, 'whitelist.json')

// 配置文件路径
const CONFIG_FILE = path.join(__dirname, 'config.json')

// 默认配置
let config = {
  host: 'h.rainplay.cn',
  port: 26165,
  username: 'dream216',
  viewDistance: 100,
  reconnectAttempts: 5,
  reconnectDelay: 10000,
  adminUsername: 'bjdjwnwiuudjeh',
  maxMemories: Infinity,
  idleChatInterval: 60000,
  idleMoveInterval: 30000,
  autoEatThreshold: 10,
  autoEquipEnabled: true,
  autoPickupEnabled: true,
  guardRange: 16,
  followDistance: 3
};

// 加载配置
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8')
      const loadedConfig = JSON.parse(data)
      config = { ...config, ...loadedConfig }
      console.log('配置加载成功:', config)
    } else {
      saveConfig()
    }
  } catch (error) {
    console.error('加载配置失败:', error)
  }
}

// 保存配置
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
    console.log('配置保存成功')
  } catch (error) {
    console.error('保存配置失败:', error)
  }
}

// 加载配置
loadConfig()

// 记忆功能配置
const MEMORY_FILE = path.join(__dirname, 'memory.json')
const MAX_MEMORIES = config.maxMemories // 使用配置中的最大记忆数量

// 启动HTTP服务器接收配置更新
const http = require('http')
const PORT = 26166

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/config') {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        const newConfig = JSON.parse(body)
        config = { ...config, ...newConfig }
        saveConfig()
        console.log('配置已更新:', config)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, message: '配置更新成功' }))
      } catch (error) {
        console.error('处理配置更新失败:', error)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, message: '配置更新失败' }))
      }
    })
  } else if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      isConnected: isConnected, 
      config: config, 
      reconnectAttempts: reconnectAttempts,
      // 添加机器人详细状态信息
      robot: {
        name: bot?.username || config.username,
        position: bot?.entity?.position ? {
          x: bot.entity.position.x,
          y: bot.entity.position.y,
          z: bot.entity.position.z
        } : { x: 0, y: 0, z: 0 },
        health: bot?.health || 20,
        food: bot?.food || 20,
        experience: bot?.experience || 0,
        gamemode: bot?.game?.gamemode || 'survival',
        dimension: bot?.dimension || 'overworld',
        emotions: emotions,
        currentAction: bot?.pathfinder?.isMoving() ? 'Moving' : 'Idle'
      }
    }))
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'Not found' }))
  }
})

server.listen(PORT, () => {
  console.log(`配置服务器运行在 http://localhost:${PORT}`)
})

// 启动TCP服务器接收来自模组的命令
const net = require('net')
const COMMAND_PORT = 26167

const commandServer = net.createServer((socket) => {
  console.log('模组已连接')
  
  socket.on('data', (data) => {
    try {
      const message = data.toString().trim()
      console.log(`收到模组命令: ${message}`)
      
      // 解析JSON命令
      const commandData = JSON.parse(message)
      const commandType = commandData.type
      const commandPayload = commandData.data || {}
      
      // 处理命令
  switch (commandType) {
    case 'start':
      console.log('收到启动命令')
      // 启动机器人逻辑已在脚本开头初始化
      break
    case 'update_config':
      console.log('收到配置更新命令:', commandPayload)
      config = { ...config, ...commandPayload }
      saveConfig()
      break
    case 'command':
      console.log('收到控制命令:', commandPayload.command)
      executeCommand(commandPayload.command)
      break
    default:
      console.log('未知命令类型:', commandType)
  }
      
    } catch (error) {
      console.error('处理命令失败:', error)
    }
  })
  
  socket.on('end', () => {
    console.log('模组已断开连接')
  })
  
  socket.on('error', (error) => {
    console.error('连接错误:', error)
  })
})

commandServer.listen(COMMAND_PORT, () => {
  console.log(`命令服务器运行在端口 ${COMMAND_PORT}`)
})

// 定期保存配置到文件
setInterval(() => {
  saveConfig()
}, 300000) // 每5分钟保存一次
let memories = []

// 投影功能配置
const PROJECTION_DIR = path.join(__dirname, '投影')
// 确保投影目录存在
if (!fs.existsSync(PROJECTION_DIR)) {
  fs.mkdirSync(PROJECTION_DIR, { recursive: true })
}

// 情绪系统配置
let emotions = {
  happiness: 50, // 0-100，0为非常难过，100为非常开心
  sadness: 0,    // 0-100，0为不难过，100为非常难过
  anger: 0,      // 0-100，0为不生气，100为非常生气
  fear: 0        // 0-100，0为不害怕，100为非常害怕
}

// 调整情绪
function adjustEmotion(emotionType, value) {
  emotions[emotionType] += value
  
  // 确保情绪值在0-100之间
  emotions[emotionType] = Math.max(0, Math.min(100, emotions[emotionType]))
  
  // 处理情绪之间的关联，比如开心增加会减少难过
  if (emotionType === 'happiness') {
    emotions.sadness = Math.max(0, emotions.sadness - value / 2)
    emotions.anger = Math.max(0, emotions.anger - value / 3)
    emotions.fear = Math.max(0, emotions.fear - value / 3)
  } else if (emotionType === 'sadness') {
    emotions.happiness = Math.max(0, emotions.happiness - value / 2)
  } else if (emotionType === 'anger') {
    emotions.happiness = Math.max(0, emotions.happiness - value / 3)
    emotions.fear = Math.max(0, emotions.fear + value / 3)
  } else if (emotionType === 'fear') {
    emotions.happiness = Math.max(0, emotions.happiness - value / 3)
    emotions.anger = Math.max(0, emotions.anger + value / 4)
  }
}

// 加载记忆
function loadMemories() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, 'utf8')
      memories = JSON.parse(data)
      if (!Array.isArray(memories)) {
        memories = []
      }
      console.log('记忆加载成功，共', memories.length, '条')
    } else {
      memories = []
      saveMemories()
    }
  } catch (error) {
    console.error('加载记忆失败:', error)
    memories = []
    saveMemories()
  }
}

// 保存记忆
function saveMemories() {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2))
    // console.log('记忆保存成功')
  } catch (error) {
    console.error('保存记忆失败:', error)
  }
}

// 添加记忆
function addMemory(type, content, relatedEntity = null) {
  const memory = {
    type: type,
    time: new Date().toISOString(),
    content: content,
    location: {
      x: Math.floor(bot.entity.position.x),
      y: Math.floor(bot.entity.position.y),
      z: Math.floor(bot.entity.position.z)
    },
    relatedEntity: relatedEntity
  }
  memories.push(memory)
  
  // 定期保存，避免频繁写入
  if (memories.length % 10 === 0) {
    saveMemories()
  }
}

// 加载记忆
loadMemories()

let bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    logErrors: false,
    viewDistance: config.viewDistance, // 使用配置中的视野距离
    keepAlive: true, // 启用keepalive
    connectTimeout: 30000, // 连接超时时间30秒
    pingInterval: 2000, // 2秒ping一次
    pingTimeout: 10000 // ping超时10秒
})

// 重新连接配置
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10 // 增加到10次尝试
const RECONNECT_DELAY = config.reconnectDelay // 使用配置中的重连延迟
let reconnectTimeout = null

// 记录连接状态
let isConnected = false

// 添加错误处理
bot.on('error', (err) => {
    console.error('Bot error:', err)
    
    // 处理网络连接错误
    if (err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        console.error(`网络连接错误 (${err.code})，尝试重新连接...`)
        handleReconnect()
    }
})

// 添加超时处理
bot.on('timeout', () => {
    console.error('Bot timed out')
    handleReconnect()
})

// 添加断开连接处理
bot.on('end', (reason) => {
    console.error(`Bot disconnected: ${reason}`)
    isConnected = false
    handleReconnect()
})

// 添加连接成功处理
bot.on('spawn', () => {
    console.log('Bot connected successfully')
    isConnected = true
    reconnectAttempts = 0
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
    }
})

// 重新连接函数
function handleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`已尝试重新连接 ${MAX_RECONNECT_ATTEMPTS} 次，放弃重新连接`)
        return
    }
    
    reconnectAttempts++
    console.error(`尝试重新连接 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`)
    
    // 延迟重新连接
    reconnectTimeout = setTimeout(() => {
        console.error('重新连接中...')
        // 重新创建机器人实例
        bot = mineflayer.createBot({
            host: config.host,
            port: config.port,
            username: config.username,
            logErrors: false,
            viewDistance: config.viewDistance,
            keepAlive: true, // 启用keepalive
            connectTimeout: 30000, // 连接超时时间30秒
            pingInterval: 2000, // 2秒ping一次
            pingTimeout: 10000 // ping超时10秒
        })
        
        // 重新加载插件
        bot.loadPlugin(pvp)
        bot.loadPlugin(armorManager)
        bot.loadPlugin(pathfinder)
        
        // 重新添加事件监听器
        // 注意：这里需要重新添加所有事件监听器
        // 为了简化，我们只添加必要的错误处理和重新连接逻辑
        // 完整的实现应该重新添加所有事件监听器
        bot.on('error', (err) => {
            console.error('Bot error:', err)
            if (err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
                console.error(`网络连接错误 (${err.code})，尝试重新连接...`)
                handleReconnect()
            }
        })
        
        bot.on('timeout', () => {
            console.error('Bot timed out')
            handleReconnect()
        })
        
        bot.on('end', (reason) => {
            console.error(`Bot disconnected: ${reason}`)
            isConnected = false
            handleReconnect()
        })
        
        bot.on('spawn', () => {
            console.log('Bot connected successfully')
            isConnected = true
            reconnectAttempts = 0
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout)
                reconnectTimeout = null
            }
            
            // 重新添加记忆事件
            addMemory('spawn', '机器人重生或登录')
            adjustEmotion('happiness', 10) // 重生时感到开心
        })
        
        // 重新添加死亡事件监听器
        bot.on('death', () => {
            addMemory('death', '机器人死亡')
            adjustEmotion('sadness', 30) // 死亡感到非常难过
            adjustEmotion('fear', 25) // 死亡感到非常害怕
            console.log('机器人死亡')
        })
        
    }, RECONNECT_DELAY)
}

bot.loadPlugin(pvp)
bot.loadPlugin(armorManager)
bot.loadPlugin(pathfinder)

// 记忆事件监听器

// 登录/重生事件
bot.on('spawn', () => {
  addMemory('spawn', '机器人重生或登录')
  adjustEmotion('happiness', 10) // 重生时感到开心
})

// 玩家加入事件
bot.on('playerJoined', (player) => {
  addMemory('playerJoined', `${player.username} 加入了服务器`, player.username)
  adjustEmotion('happiness', 15) // 有玩家加入感到开心
})

// 玩家离开事件
bot.on('playerLeft', (player) => {
  addMemory('playerLeft', `${player.username} 离开了服务器`, player.username)
  adjustEmotion('sadness', 15) // 有玩家离开感到难过
})

// 聊天回复消息库
const chatReplies = {
  // 问候回复
  greeting: [
    '你好！',
    '嗨，很高兴见到你！',
    '你好啊！',
    '嗨，最近怎么样？',
    '你好，有什么可以帮你的吗？'
  ],
  // 再见回复
  goodbye: [
    '再见！',
    '下次见！',
    '拜拜！',
    '希望能再见到你！',
    '一路顺风！'
  ],
  // 感谢回复
  thanks: [
    '不客气！',
    '很高兴能帮到你！',
    '不用谢！',
    '这是我应该做的！',
    '随时为你服务！'
  ],
  // 道歉回复
  sorry: [
    '没关系！',
    '别放在心上！',
    '我原谅你了！',
    '没事的！',
    '过去了就好！'
  ],
  // 询问回复
  question: [
    '我不太清楚，你可以再详细说说吗？',
    '这个问题有点复杂，让我想想...',
    '我不太确定，你知道答案吗？',
    '这个问题很有趣！',
    '我还在学习中，可能无法回答这个问题...'
  ],
  // 普通回复
  general: [
    '我明白了！',
    '听起来不错！',
    '哦，这样啊！',
    '我也是这么想的！',
    '很有意思！',
    '真的吗？',
    '太棒了！',
    '我知道了！',
    '你说得对！',
    '我同意你的看法！'
  ]
}

// 上次回复同一玩家的时间
let lastReplyTime = {} 

// 回复冷却时间（毫秒）
const REPLY_COOLDOWN = 5000 // 5秒

// 生成聊天回复
function generateReply(message) {
  // 转换为小写便于匹配
  const lowerMessage = message.toLowerCase()
  
  // 根据消息内容选择回复类型
  if (lowerMessage.includes('你好') || lowerMessage.includes('嗨') || lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return chatReplies.greeting[Math.floor(Math.random() * chatReplies.greeting.length)]
  } else if (lowerMessage.includes('再见') || lowerMessage.includes('拜拜') || lowerMessage.includes('bye')) {
    return chatReplies.goodbye[Math.floor(Math.random() * chatReplies.goodbye.length)]
  } else if (lowerMessage.includes('谢谢') || lowerMessage.includes('thank')) {
    return chatReplies.thanks[Math.floor(Math.random() * chatReplies.thanks.length)]
  } else if (lowerMessage.includes('对不起') || lowerMessage.includes('抱歉') || lowerMessage.includes('sorry')) {
    return chatReplies.sorry[Math.floor(Math.random() * chatReplies.sorry.length)]
  } else if (lowerMessage.includes('？') || lowerMessage.includes('?') || lowerMessage.includes('吗') || lowerMessage.includes('呢')) {
    return chatReplies.question[Math.floor(Math.random() * chatReplies.question.length)]
  } else {
    return chatReplies.general[Math.floor(Math.random() * chatReplies.general.length)]
  }
}

// 聊天事件
bot.on('chat', (username, message) => {
  if (username !== bot.username) {
    addMemory('chat', `收到 ${username} 的消息: ${message}`, username)
    
    // 根据消息内容调整情绪
    if (message.includes('好') || message.includes('棒') || message.includes('开心') || message.includes('喜欢')) {
      adjustEmotion('happiness', 20)
    } else if (message.includes('坏') || message.includes('生气') || message.includes('讨厌') || message.includes('滚')) {
      adjustEmotion('anger', 20)
    } else if (message.includes('害怕') || message.includes('恐怖') || message.includes('救命')) {
      adjustEmotion('fear', 15)
    } else {
      adjustEmotion('happiness', 10) // 收到消息本身就会开心
    }
    
    // 检查是否是命令（如果包含命令关键字，就不回复）
    const isCommand = ['w', 's', 'a', 'd', '左键', '右键', 'q', '1', '2', '3', '4', '5', '6', '7', '8', '9', '跳', '守卫', '跟着', '战斗', '停止', '精打击', '说', '帮助', '机器人你在哪？', 'f', '聊家常', '查看情绪', '情绪状态', '你现在感觉怎么样？'].some(cmd => message.startsWith(cmd)) || message.includes('它在哪呢？') || message.includes('添加白名单') || message.includes('移除白名单') || message === '查看白名单' || message.startsWith('记忆')
    
    // 只对白名单用户且消息包含"216"的消息进行回复
    if (!isCommand && whiteList.includes(username) && message.includes('216')) {
      const now = Date.now()
      // 检查冷却时间
      if (!lastReplyTime[username] || now - lastReplyTime[username] > REPLY_COOLDOWN) {
        // 生成回复
        const reply = generateReply(message)
        // 发送回复
        bot.chat(`${username}，${reply}`)
        // 更新回复时间
        lastReplyTime[username] = now
      }
    }
  }
})

// 攻击事件
bot.on('attack', (victim) => {
  const victimName = victim.username || victim.displayName || '未知实体'
  addMemory('attack', `攻击了 ${victimName}`, victimName)
  adjustEmotion('anger', 15) // 攻击时感到生气
})

// 被攻击事件
bot.on('entityHurt', (entity) => {
  if (entity === bot.entity) {
    addMemory('hurt', '被攻击')
    adjustEmotion('sadness', 20) // 被攻击感到难过
    adjustEmotion('fear', 25) // 被攻击感到害怕
  } else if (entity.type === 'player') {
    addMemory('entityHurt', `${entity.username} 受到了伤害`, entity.username)
    adjustEmotion('sadness', 10) // 看到玩家受伤感到难过
  }
})

// 死亡事件
bot.on('death', () => {
  addMemory('death', '机器人死亡')
  adjustEmotion('sadness', 30) // 死亡感到非常难过
  adjustEmotion('fear', 25) // 死亡感到非常害怕
  console.log('机器人死亡')
})

// 实体死亡事件
bot.on('entityDeath', (entity) => {
  if (entity.type === 'player') {
    addMemory('playerDeath', `${entity.username} 死亡了`, entity.username)
    adjustEmotion('sadness', 20) // 看到玩家死亡感到难过
  } else {
    const entityName = entity.displayName || '未知实体'
    addMemory('entityDeath', `${entityName} 死亡了`, entityName)
    adjustEmotion('happiness', 5) // 杀死怪物感到有点开心
  }
})

// 寻找附近的陷阱箱
function findTrapChest() {
  const chests = []
  
  // 遍历所有实体，寻找陷阱箱
  for (const entity of Object.values(bot.entities)) {
    if (entity.type === 'object' && entity.name === 'minecraft:trapped_chest') {
      chests.push(entity)
    }
  }
  
  // 遍历所有方块，寻找陷阱箱
  for (let x = -50; x <= 50; x++) {
    for (let y = -10; y <= 10; y++) {
      for (let z = -50; z <= 50; z++) {
        const block = bot.blockAt(bot.entity.position.offset(x, y, z))
        if (block && block.name === 'trapped_chest') {
          chests.push(block)
        }
      }
    }
  }
  
  // 按距离排序，返回最近的陷阱箱
  return chests.sort((a, b) => {
    const distanceA = bot.entity.position.distanceTo(a.position || a)
    const distanceB = bot.entity.position.distanceTo(b.position || b)
    return distanceA - distanceB
  })[0] || null
}

// 获取陷阱箱中的材料
async function getTrapChestMaterials(chest) {
  try {
    // 打开陷阱箱
    await bot.openChest(chest)
    
    // 获取箱子中的所有物品
    const items = bot.inventory.items()
    
    // 关闭箱子
    await bot.closeWindow()
    
    return items
  } catch (error) {
    console.error('获取陷阱箱材料失败:', error)
    return []
  }
}

// 制作投影
function createProjection(materials, fileName) {
  // 生成投影数据（简化版，实际可能需要更复杂的格式）
  const projection = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    creator: bot.username,
    materials: materials.map(item => ({
      name: item.name,
      count: item.count,
      durability: item.durability,
      maxDurability: item.maxDurability
    })),
    // 这里可以添加更多投影数据，比如结构、位置等
    structure: {
      type: 'simple_structure',
      size: { x: 5, y: 5, z: 5 },
      blocks: []
    }
  }
  
  // 保存投影文件
  const filePath = path.join(PROJECTION_DIR, `${fileName}.json`)
  fs.writeFileSync(filePath, JSON.stringify(projection, null, 2))
  
  return filePath
}

// 收集物品事件
bot.on('playerCollect', (collector, itemDrop) => {
  if (collector === bot.entity) {
    const itemName = itemDrop.name || '未知物品'
    addMemory('collect', `收集了 ${itemName}`, itemName)
    adjustEmotion('happiness', 15) // 收集物品感到开心
  }
})

// 饥饿变化事件
bot.on('foodChanged', (oldFood) => {
  if (bot.food < oldFood) {
    addMemory('hunger', `饥饿值降低，当前: ${bot.food}/20`)
    adjustEmotion('sadness', 10) // 饥饿值降低感到难过
    adjustEmotion('anger', 5) // 饥饿值降低感到有点生气
  } else if (bot.food > oldFood) {
    addMemory('hunger', `饥饿值恢复，当前: ${bot.food}/20`)
    adjustEmotion('happiness', 15) // 饥饿值恢复感到开心
  }
})

// 装备变化事件
bot.on('equipmentChanged', (entity, slot, oldItem, newItem) => {
  if (entity === bot.entity) {
    if (newItem) {
      addMemory('equip', `装备了 ${newItem.name}`, newItem.name)
      adjustEmotion('happiness', 12) // 装备新物品感到开心
    } else {
      const oldItemName = oldItem ? oldItem.name : '未知物品'
      addMemory('equip', `卸下了 ${oldItemName}`, oldItemName)
      adjustEmotion('sadness', 5) // 卸下物品感到有点难过
    }
  }
})

// 时间变化事件
bot.on('time', (time) => {
  // 每小时记录一次时间
  if (time % 1000 === 0) {
    const dayTime = time % 24000
    const timeStr = dayTime < 12000 ? `白天 (${dayTime})` : `夜晚 (${dayTime})`
    addMemory('time', `当前时间: ${timeStr}`)
    
    // 白天感到开心，夜晚感到害怕，但频率降低
    if (dayTime < 12000) {
      adjustEmotion('happiness', 5)
      adjustEmotion('fear', -5)
    } else {
      adjustEmotion('sadness', 5)
      adjustEmotion('fear', 8)
    }
  }
})

// 方块破坏事件
bot.on('breakBlock', (oldBlock) => {
  addMemory('breakBlock', `破坏了 ${oldBlock.name} 方块`, oldBlock.name)
  adjustEmotion('happiness', 5) // 破坏方块感到有点开心
})

// 方块放置事件
bot.on('placeBlock', (newBlock) => {
  addMemory('placeBlock', `放置了 ${newBlock.name} 方块`, newBlock.name)
  adjustEmotion('happiness', 8) // 放置方块感到开心
})

// 天气变化事件
bot.on('weather', (weather) => {
  addMemory('weather', `天气变为: ${weather}`)
  
  // 根据天气调整情绪
  if (weather === 'clear') {
    adjustEmotion('happiness', 15)
    adjustEmotion('sadness', -10)
  } else if (weather === 'rain' || weather === 'snow') {
    adjustEmotion('sadness', 15)
    adjustEmotion('happiness', -10)
  } else if (weather === 'thunder') {
    adjustEmotion('fear', 20)
    adjustEmotion('sadness', 10)
  }
})

// 经验变化事件
bot.on('experience', (experience) => {
  if (experience && typeof experience === 'object') {
    const totalExperience = experience.totalExperience || experience.experience || 0
    const level = experience.level || 0
    addMemory('experience', `经验变化: ${totalExperience} (等级: ${level})`)
    
    if (totalExperience > 0) {
      adjustEmotion('happiness', 20) // 获得经验感到开心
    } else {
      adjustEmotion('sadness', 10) // 失去经验感到难过
    }
  }
})

// 物品丢弃事件
bot.on('itemDrop', (item) => {
  const itemName = item.name || '未知物品'
  addMemory('itemDrop', `丢弃了 ${itemName}`, itemName)
  adjustEmotion('sadness', 10) // 丢弃物品感到难过
})

// 实体生成事件
bot.on('entitySpawn', (entity) => {
  if (entity.type === 'player') return // 玩家加入已经有单独的事件
  const entityName = entity.displayName || entity.name || '未知实体'
  addMemory('entitySpawn', `${entityName} 生成了`, entityName)
  
  // 敌对生物生成时感到害怕
  if (entity.name && (entity.name.includes('creeper') || entity.name.includes('zombie') || entity.name.includes('skeleton') || entity.name.includes('spider'))) {
    adjustEmotion('fear', 15)
  }
})

// 实体消失事件
bot.on('entityGone', (entity) => {
  if (entity.type === 'player') return // 玩家离开已经有单独的事件
  const entityName = entity.displayName || entity.name || '未知实体'
  addMemory('entityGone', `${entityName} 消失了`, entityName)
  
  // 敌对生物消失时感到开心
  if (entity.name && (entity.name.includes('creeper') || entity.name.includes('zombie') || entity.name.includes('skeleton') || entity.name.includes('spider'))) {
    adjustEmotion('happiness', 15)
  }
})


bot.on('playerCollect', (collector, itemDrop) => {
  if (collector !== bot.entity) return

  const randomDelay = Math.floor(Math.random() * 100) + 100
  setTimeout(() => {
    autoEquipBest()
  }, randomDelay)
})

let guardPos = null
let followTarget = null
let lastAttackTime = 0
const MIN_ATTACK_DELAY = 150 
let tickCounter = 0
const TICK_INTERVAL = 2 

// 白名单系统
const WHITE_LIST_ADMIN = config.adminUsername // 使用配置中的管理员用户名

// 读取白名单从文件
let whiteList = []

function loadWhiteList() {
  try {
    if (fs.existsSync(WHITELIST_FILE)) {
      const data = fs.readFileSync(WHITELIST_FILE, 'utf8')
      const loadedList = JSON.parse(data)
      whiteList = Array.isArray(loadedList) ? loadedList : []
      // 确保管理员始终在白名单中
      if (!whiteList.includes(WHITE_LIST_ADMIN)) {
        whiteList.push(WHITE_LIST_ADMIN)
      }
    } else {
      // 如果文件不存在，创建初始白名单
      whiteList = [WHITE_LIST_ADMIN]
      saveWhiteList()
    }
    console.log('白名单加载成功:', whiteList)
  } catch (error) {
    console.error('加载白名单失败:', error)
    whiteList = [WHITE_LIST_ADMIN]
    saveWhiteList()
  }
}

// 保存白名单到文件
function saveWhiteList() {
  try {
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whiteList, null, 2))
    console.log('白名单保存成功:', whiteList)
  } catch (error) {
    console.error('保存白名单失败:', error)
  }
}

// 初始化加载白名单
loadWhiteList()

function guardArea (pos) {
  guardPos = pos.clone()
  followTarget = null

  if (!bot.pvp.target) {
    moveToGuardPos()
  }
}

function stopGuarding () {
  guardPos = null
  bot.pvp.stop()
  bot.pathfinder.setGoal(null)
}

function followPlayer (player) {
  followTarget = player
  guardPos = null
  bot.pvp.stop()
}

function stopFollowing () {
  followTarget = null
  bot.pathfinder.setGoal(null)
}

function autoEat() {
  if (bot.food < config.autoEatThreshold && config.autoEatEnabled) {
    const food = bot.inventory.items().find(item => item.foodPoints > 0)
    if (food) {
      bot.equip(food, 'hand')
      bot.consume()
    }
  }
}


function autoPickup() {
  const droppedItems = Object.values(bot.entities).filter(entity => 
    entity.type === 'item' && 
    entity.position.distanceTo(bot.entity.position) < 10
  )
  
  if (droppedItems.length > 0) {
    const nearestItem = droppedItems.reduce((closest, item) => {
      const distance = item.position.distanceTo(bot.entity.position)
      const closestDistance = closest.position.distanceTo(bot.entity.position)
      return distance < closestDistance ? item : closest
    })
    
    const mcData = require('minecraft-data')(bot.version)
    const movements = new Movements(bot, mcData)
    movements.canJump = true // 启用自动跳跃
    bot.pathfinder.setMovements(movements)
    bot.pathfinder.setGoal(new GoalBlock(
      Math.floor(nearestItem.position.x),
      Math.floor(nearestItem.position.y),
      Math.floor(nearestItem.position.z)
    ))
  }
}

function autoEquipBest() {
  const armorPriority = ['diamond', 'netherite', 'iron', 'gold', 'stone', 'wood', 'leather']
  
  const weaponPriority = ['diamond', 'netherite', 'iron', 'gold', 'stone', 'wood']
  
  const armorTypes = ['helmet', 'chestplate', 'leggings', 'boots']
  armorTypes.forEach(armorType => {
    const armors = bot.inventory.items().filter(item => 
      item.name.includes(armorType) && item.durability < item.maxDurability
    )
    
    if (armors.length > 0) {
      const bestArmor = armors.sort((a, b) => {
        const aMaterial = armorPriority.findIndex(m => a.name.includes(m))
        const bMaterial = armorPriority.findIndex(m => b.name.includes(m))
        
        if (aMaterial !== bMaterial) {
          return aMaterial - bMaterial
        }
        
        return (b.maxDurability - b.durability) - (a.maxDurability - a.durability)
      })[0]
      
      if (bestArmor) {
        // 装备最好的盔甲
        bot.equip(bestArmor, armorType)
      }
    }
  })
  
  // 检查并装备最好的武器
  const weapons = bot.inventory.items().filter(item => 
    item.name.includes('sword') || item.name.includes('axe')
  )
  
  if (weapons.length > 0) {
    // 按材质优先级排序
    const bestWeapon = weapons.sort((a, b) => {
      // 获取材质优先级
      const aMaterial = weaponPriority.findIndex(m => a.name.includes(m))
      const bMaterial = weaponPriority.findIndex(m => b.name.includes(m))
      
      // 优先级越高（索引越小）越靠前
      if (aMaterial !== bMaterial) {
        return aMaterial - bMaterial
      }
      
      // 如果材质相同，按耐久度排序，耐久度越高越好
      return (b.maxDurability - b.durability) - (a.maxDurability - a.durability)
    })[0]
    
    if (bestWeapon) {
      bot.equip(bestWeapon, 'hand')
    }
  }
  
  // 检查并装备盾牌
  const shield = bot.inventory.items().find(item => item.name.includes('shield'))
  if (shield) {
    bot.equip(shield, 'off-hand')
  }
}

function moveToGuardPos () {
  const mcData = require('minecraft-data')(bot.version)
  const movements = new Movements(bot, mcData)
  movements.canJump = true // 启用自动跳跃
  bot.pathfinder.setMovements(movements)
  
  // 添加随机偏移，模拟人类移动的不精确性
  const randomX = Math.floor(Math.random() * 3) - 1 // -1到1之间的随机整数
  const randomZ = Math.floor(Math.random() * 3) - 1 // -1到1之间的随机整数
  
  bot.pathfinder.setGoal(new GoalBlock(
    guardPos.x + randomX, 
    guardPos.y, 
    guardPos.z + randomZ
  ))
}

bot.on('stoppedAttacking', () => {
  if (guardPos) {
    moveToGuardPos()
  }
})

// 自主聊天消息库
const idleChatMessages = [
  '今天天气真不错！',
  '有没有人想一起玩啊？',
  '我在这里已经待了很久了...',
  '有没有什么有趣的事情可以做？',
  '我感觉自己充满了活力！',
  '有人吗？来聊聊天吧！',
  '今天过得怎么样？',
  '我喜欢在这里探索！',
  '有没有人需要帮助？',
  '我觉得自己变得越来越聪明了！'
]

// 上次自主聊天时间
let lastIdleChatTime = 0

// 自主聊天间隔（毫秒）
const IDLE_CHAT_INTERVAL = config.idleChatInterval // 使用配置中的聊天间隔

// 上次自主移动时间
let lastIdleMoveTime = 0

// 自主移动间隔（毫秒）
const IDLE_MOVE_INTERVAL = config.idleMoveInterval // 使用配置中的移动间隔

bot.on('physicsTick', () => {
  tickCounter++
  if (tickCounter % TICK_INTERVAL !== 0) return
  
  // 定期检查是否需要吃东西
  if (tickCounter % (10 * TICK_INTERVAL) === 0) {
    autoEat()
  }
  
  // 定期检查是否需要装备最好的装备
  if (tickCounter % (20 * TICK_INTERVAL) === 0 && config.autoEquipEnabled) {
    autoEquipBest()
  }
  
  // 定期检查是否有掉落物品需要拾取
  if (tickCounter % (5 * TICK_INTERVAL) === 0 && config.autoPickupEnabled) {
    // 只有在没有战斗目标和不在移动时才自动捡物品
    if (!bot.pvp.target && !bot.pathfinder.isMoving()) {
      autoPickup()
    }
  }
  
  // 跟随逻辑
  if (followTarget && followTarget.entity) {
    const mcData = require('minecraft-data')(bot.version)
    bot.pathfinder.setMovements(new Movements(bot, mcData))
    
    // 使用配置中的跟随距离
    const distance = bot.entity.position.distanceTo(followTarget.entity.position)
    if (distance > config.followDistance) {
      bot.pathfinder.setGoal(new GoalBlock(
        Math.floor(followTarget.entity.position.x),
        Math.floor(followTarget.entity.position.y),
        Math.floor(followTarget.entity.position.z)
      ))
    } else if (distance < config.followDistance - 1) {
      // 如果太近，就稍微后退
      const direction = bot.entity.position.subtract(followTarget.entity.position).normalize()
      bot.pathfinder.setGoal(new GoalBlock(
        Math.floor(bot.entity.position.x + direction.x * 2),
        Math.floor(bot.entity.position.y),
        Math.floor(bot.entity.position.z + direction.z * 2)
      ))
    }
  }
  
  // 守卫逻辑
  if (guardPos) {
    const filter = e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < config.guardRange &&
                        e.displayName !== 'Armor Stand' // Mojang classifies armor stands as mobs for some reason?

    const entity = bot.nearestEntity(filter)
    const now = Date.now()
    if (entity && now - lastAttackTime > MIN_ATTACK_DELAY) {
      bot.pvp.attack(entity)
      lastAttackTime = now
    }
  }
  
  if (bot.pvp.target) return
  
  // 自主行走功能
  if (!bot.pathfinder.isMoving()) {
    const now = Date.now()
    
    // 检查是否可以自主移动
    if (now - lastIdleMoveTime > IDLE_MOVE_INTERVAL) {
      // 随机决定是否移动（70%概率）
      if (Math.random() < 0.7) {
        // 生成随机目标位置（当前位置周围5-15格）
        const randomDistance = Math.floor(Math.random() * 11) + 5 // 5-15格
        const randomAngle = Math.random() * Math.PI * 2 // 0-360度
        
        const targetX = Math.floor(bot.entity.position.x + Math.cos(randomAngle) * randomDistance)
        const targetY = Math.floor(bot.entity.position.y)
        const targetZ = Math.floor(bot.entity.position.z + Math.sin(randomAngle) * randomDistance)
        
        // 设置移动目标
        const mcData = require('minecraft-data')(bot.version)
        const movements = new Movements(bot, mcData)
        movements.canJump = true
        bot.pathfinder.setMovements(movements)
        bot.pathfinder.setGoal(new GoalBlock(targetX, targetY, targetZ))
        
        // 更新上次移动时间
        lastIdleMoveTime = now
      }
    }
    
    // 自主聊天功能
    if (now - lastIdleChatTime > IDLE_CHAT_INTERVAL) {
      // 随机决定是否聊天（60%概率）
      if (Math.random() < 0.6) {
        const randomMessage = idleChatMessages[Math.floor(Math.random() * idleChatMessages.length)]
        bot.chat(randomMessage)
        
        // 更新上次聊天时间
        lastIdleChatTime = now
      }
    }
  }
  
  // 闲置时看向玩家
  if (!bot.pathfinder.isMoving()) {
    const entity = bot.nearestEntity(e => e.type === 'player')
    if (entity) {
      // 添加随机偏移，模拟人类瞄准误差
      const randomX = (Math.random() - 0.5) * 0.2 // -0.1到0.1之间的随机值
      const randomY = (Math.random() - 0.5) * 0.1 // -0.05到0.05之间的随机值
      const randomZ = (Math.random() - 0.5) * 0.2 // -0.1到0.1之间的随机值
      
      bot.lookAt(entity.position.offset(
        randomX, 
        entity.height + randomY, 
        randomZ
      ))
    }
  }
})

bot.on('spawn', () => {
  // 延迟5秒发送登录命令
    setTimeout(() => {
        bot.chat(`/login ${config.password}`)
    }, 10 * 1000) // 10秒延迟
})

// 执行单个指令的函数
function executeCommand(command) {
  // 守卫指令
  if (command === '守卫') {
    // 守卫指令需要玩家上下文，这里简化处理
    return
  }

  // 跟着指令
  if (command === '跟着') {
    // 跟着指令需要玩家上下文，这里简化处理
    return
  }

  // 战斗指令
  if (command === '战斗') {
    // 战斗指令需要玩家上下文，这里简化处理
    return
  }

  // 停止指令
  if (command === '停止') {
    bot.chat('哦')
    stopGuarding()
    stopFollowing()
    return
  }
  
  // 说指令：说 hi → 机器人说 hi
  if (command.startsWith('说 ')) {
    const message = command.substring(2) // 获取"说 "后面的内容
    if (message) {
      bot.chat(message)
    }
    return
  }
  
  // 查看情绪指令
  if (command === '查看情绪' || command === '情绪状态' || command === '你现在感觉怎么样？') {
    bot.chat(`我现在的情绪状态：`)
    bot.chat(`开心: ${Math.round(emotions.happiness)}/100`)
    bot.chat(`难过: ${Math.round(emotions.sadness)}/100`)
    bot.chat(`生气: ${Math.round(emotions.anger)}/100`)
    bot.chat(`害怕: ${Math.round(emotions.fear)}/100`)
    return
  }

  // 帮助指令：显示所有可用指令
  if (command === '帮助' || command === 'help') {
    const helpMessages = [
      '可用指令：',
      '移动：w(前) s(后) a(左) d(右)',
      '攻击/使用：左键 右键 精打击<目标玩家>',
      '物品：q(丢弃) 1-9(切换物品栏) f(切换副手)',
      '动作：跳',
      '模式：守卫 跟着 战斗 停止',
      '聊天：说 <内容>','聊家常',
      '查询：机器人你在哪？ <玩家名>它在哪呢？ 查看白名单 查看情绪',
      '投影：投影 <文件名> （制作投影）',
      '白名单：添加白名单<玩家名> 移除白名单<玩家名>（仅管理员）',
      '帮助：帮助/help',
      '支持多指令序列，如：w s a d'
    ]
    
    // 依次发送帮助信息
    helpMessages.forEach((msg, index) => {
      setTimeout(() => {
        bot.chat(msg)
      }, index * 300)
    })
    return
  }

  // W S A D 移动控制
  if (['w', 's', 'a', 'd'].includes(command.toLowerCase())) {
    const direction = command.toLowerCase()
    const mcData = require('minecraft-data')(bot.version)
    const movements = new Movements(bot, mcData)
    movements.canJump = true // 启用自动跳跃
    bot.pathfinder.setMovements(movements)
    
    // 获取当前朝向
    const yaw = bot.entity.yaw
    let dx = 0
    let dz = 0
    const distance = 1 // 每次移动1格
    
    switch (direction) {
      case 'w':
        // 向前
        dx = Math.sin(yaw) * -distance
        dz = Math.cos(yaw) * distance
        break
      case 's':
        // 向后
        dx = Math.sin(yaw) * distance
        dz = Math.cos(yaw) * -distance
        break
      case 'a':
        // 向左
        dx = Math.sin(yaw - Math.PI/2) * -distance
        dz = Math.cos(yaw - Math.PI/2) * distance
        break
      case 'd':
        // 向右
        dx = Math.sin(yaw + Math.PI/2) * -distance
        dz = Math.cos(yaw + Math.PI/2) * distance
        break
    }
    
    // 计算目标位置
    const targetX = Math.floor(bot.entity.position.x + dx)
    const targetY = Math.floor(bot.entity.position.y)
    const targetZ = Math.floor(bot.entity.position.z + dz)
    
    bot.pathfinder.setGoal(new GoalBlock(targetX, targetY, targetZ))
    return
  }
  
  // 左键攻击
  if (command === '左键') {
    // 只攻击实体，不挖方块
    const entity = bot.nearestEntity(e => e.type === 'player' || e.type === 'hostile')
    if (entity) {
      bot.attack(entity)
    } else {
      // 没有实体时什么都不做，不挖方块
      console.log('没有可攻击的实体')
    }
    return
  }
  
  // 右键使用
  if (command === '右键') {
    // 尝试使用当前手持物品或交互前方的方块
    const block = bot.blockAt(bot.entity.position.offset(0, 0, 2))
    if (block) {
      bot.activateBlock(block)
    } else {
      // 如果没有方块，就使用手持物品
      bot.useItem()
    }
    return
  }
  
  // q 丢弃物品
  if (command === 'q') {
    // 丢弃当前手持物品
    const currentItem = bot.heldItem
    if (currentItem) {
      bot.tossStack(currentItem)
    }
    return
  }
  
  // 1-9 切换物品栏
  if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(command)) {
    const slot = parseInt(command) - 1 // 物品栏索引从0开始
    bot.setQuickBarSlot(slot)
    return
  }
  
  // 跳 跳跃
  if (command === '跳') {
    bot.setControlState('jump', true)
    // 短暂跳跃后释放跳跃键
    setTimeout(() => {
      bot.setControlState('jump', false)
    }, 100)
    return
  }
  
  // f 切换副手物品
  if (command === 'f') {
    // 切换主手和副手物品
    const mainHandItem = bot.heldItem
    const offHandItem = bot.offHandItem
    
    // 尝试将主手物品放在副手，副手物品放在主手
    if (offHandItem) {
      // 先将主手物品放在背包
      bot.equip(offHandItem, 'hand')
      // 再将原主手物品放在副手
      if (mainHandItem) {
        bot.equip(mainHandItem, 'off-hand')
      }
    } else if (mainHandItem) {
      // 直接将主手物品放在副手
      bot.equip(mainHandItem, 'off-hand')
    }
    
    bot.chat('已切换副手')
    return
  }
  
  // 精打击<目标玩家> 攻击指定玩家，支持"精打击Steve"和"精打击 Steve"格式
  if (command.startsWith('精打击')) {
    // 移除"精打击"前缀，处理可能的空格
    const targetName = command.replace(/^精打击\s*/, '').trim() // 获取"精打击"后面的玩家名
    if (targetName) {
      const target = bot.players[targetName]
      if (target && target.entity) {
        // 检查玩家是否在32格范围内
        const distance = target.entity.position.distanceTo(bot.entity.position)
        if (distance <= 100) {
          bot.pvp.attack(target.entity)
          bot.chat(`开始攻击 ${targetName}`)
        } else {
          bot.chat(`${targetName} 距离太远，无法攻击（距离：${Math.round(distance)}格）`)
        }
      } else {
        bot.chat(`找不到玩家 ${targetName}`)
      }
    }
    return
  }
  
  // 机器人你在哪？ 返回当前坐标
  if (command === '机器人你在哪？') {
    const pos = bot.entity.position
    bot.chat(`我在 X: ${Math.floor(pos.x)} Y: ${Math.floor(pos.y)} Z: ${Math.floor(pos.z)}`)
    return
  }
  
  // <玩家名>它在哪呢？ 查询指定玩家的位置
  if (command.endsWith('它在哪呢？')) {
    // 提取玩家名，移除"它在哪呢？"后缀
    const targetName = command.replace(/它在哪呢？$/, '').trim()
    if (targetName) {
      const target = bot.players[targetName]
      if (target) {
        if (target.entity) {
          // 玩家在视野范围内，直接获取位置
          const pos = target.entity.position
          bot.chat(`${targetName} 在 X: ${Math.floor(pos.x)} Y: ${Math.floor(pos.y)} Z: ${Math.floor(pos.z)}`)
        } else if (target.username) {
          // 玩家存在但不在视野范围内
          bot.chat(`${targetName} 已在线，但不在我的视野范围内`)
        } else {
          // 玩家信息不完整
          bot.chat(`${targetName} 信息不完整，无法获取位置`)
        }
      } else {
        bot.chat(`找不到玩家 ${targetName} 或该玩家不在线`)
      }
    }
    return
  }
  
  // 聊家常指令 - 讲述痛苦经历
  if (command === '聊家常') {
    // 过滤痛苦相关的记忆
    const painfulMemories = memories.filter(m => {
      return ['hurt', 'death', 'playerDeath', 'entityHurt', 'entityDeath'].includes(m.type)
    })
    
    if (painfulMemories.length === 0) {
      bot.chat('我还没有经历过什么痛苦的事情...')
      return
    }
    
    // 随机选择3-5条痛苦经历
    const numStories = Math.min(Math.floor(Math.random() * 3) + 3, painfulMemories.length)
    const selectedMemories = []
    
    for (let i = 0; i < numStories; i++) {
      const randomIndex = Math.floor(Math.random() * painfulMemories.length)
      selectedMemories.push(painfulMemories[randomIndex])
      // 避免重复选择同一条记忆
      painfulMemories.splice(randomIndex, 1)
    }
    
    // 开始讲述
    bot.chat('让我告诉你一些我经历过的痛苦...')
    selectedMemories.forEach((memory, index) => {
      const time = new Date(memory.time).toLocaleString()
      setTimeout(() => {
        bot.chat(`${index+1}. [${time}] ${memory.content} (位置: ${memory.location.x},${memory.location.y},${memory.location.z})`)
      }, (index + 1) * 500) // 每条间隔500ms
    })
    
    return
  }
  
  // 记忆查询指令
  if (command.startsWith('记忆')) {
    // 解析查询参数
    const params = command.replace(/^记忆/, '').trim().split(/\s+/)
    let commandType = params[0] || '最近'
    let entityFilter = params[1] || null
    
    let filteredMemories = memories
    
    // 按类型过滤
    if (commandType === '聊天') {
      filteredMemories = memories.filter(m => m.type === 'chat')
    } else if (commandType === '攻击') {
      filteredMemories = memories.filter(m => m.type === 'attack')
    } else if (commandType === '收集') {
      filteredMemories = memories.filter(m => m.type === 'collect')
    } else if (commandType === '装备') {
      filteredMemories = memories.filter(m => m.type === 'equip')
    } else if (commandType === '死亡') {
      filteredMemories = memories.filter(m => m.type === 'death' || m.type === 'playerDeath')
    } else if (commandType === '伤害') {
      filteredMemories = memories.filter(m => m.type === 'hurt' || m.type === 'entityHurt')
    } else if (commandType === '玩家') {
      filteredMemories = memories.filter(m => m.type === 'playerJoined' || m.type === 'playerLeft' || m.type === 'playerDeath')
    } else if (commandType === '方块') {
      filteredMemories = memories.filter(m => m.type === 'breakBlock' || m.type === 'placeBlock')
    } else if (commandType === '天气') {
      filteredMemories = memories.filter(m => m.type === 'weather')
    } else if (commandType === '时间') {
      filteredMemories = memories.filter(m => m.type === 'time')
    } else if (commandType === '经验') {
      filteredMemories = memories.filter(m => m.type === 'experience')
    } else if (commandType === '饥饿') {
      filteredMemories = memories.filter(m => m.type === 'hunger')
    } else if (commandType === '实体') {
      filteredMemories = memories.filter(m => m.type === 'entitySpawn' || m.type === 'entityGone' || m.type === 'entityDeath')
    } else if (commandType === '所有') {
      // 显示所有类型的记忆，不做过滤
      filteredMemories = memories
    } else if (commandType !== '最近') {
      // 检查是否是实体名称过滤
      entityFilter = commandType
      commandType = '最近'
    }
    
    // 按实体过滤
    if (entityFilter) {
      filteredMemories = filteredMemories.filter(m => m.relatedEntity === entityFilter)
    }
    
    // 获取最近的10条记忆（之前是5条，现在增加到10条）
    const recentMemories = filteredMemories.slice(-10)
    
    if (recentMemories.length === 0) {
      bot.chat('没有找到相关记忆')
      return
    }
    
    // 发送记忆
    bot.chat(`最近${commandType}记忆（共${recentMemories.length}条）：`)
    recentMemories.forEach((memory, index) => {
      const time = new Date(memory.time).toLocaleString()
      setTimeout(() => {
        bot.chat(`${index+1}. [${time}] ${memory.content} (位置: ${memory.location.x},${memory.location.y},${memory.location.z})`)
      }, index * 300)
    })
    
    return
  }
  
  // 投影指令：投影 <文件名>
  if (command.startsWith('投影 ')) {
    // 获取文件名
    const fileName = command.substring(3).trim()
    if (!fileName) {
      bot.chat('请提供投影文件名，格式：投影 <文件名>')
      return
    }
    
    bot.chat(`正在制作投影...`)
    
    // 寻找附近的陷阱箱
    const chest = findTrapChest()
    if (!chest) {
      bot.chat('未找到附近的陷阱箱')
      return
    }
    
    // 获取陷阱箱中的材料
    getTrapChestMaterials(chest).then(materials => {
      if (materials.length === 0) {
        bot.chat('陷阱箱中没有材料')
        return
      }
      
      // 制作投影
      const filePath = createProjection(materials, fileName)
      
      bot.chat(`投影制作完成！文件已保存到：${filePath}`)
      bot.chat(`投影包含 ${materials.length} 种材料`)
      
      // 记录记忆
      addMemory('projection', `制作了投影 ${fileName}，包含 ${materials.length} 种材料`)
    }).catch(error => {
      console.error('制作投影失败:', error)
      bot.chat('制作投影失败，请检查控制台日志')
    })
    
    return
  }
}

bot.on('chat', (username, message) => {
  // 忽略自己发出的指令
  if (username === bot.username) return
  
  // 检查消息是否是命令
  const isCommand = (
    // 普通指令
    ['w', 's', 'a', 'd', '左键', '右键', 'q', '1', '2', '3', '4', '5', '6', '7', '8', '9', '跳', '守卫', '跟着', '战斗', '停止', '精打击', '说', '帮助', '机器人你在哪？', 'f', '聊家常', '投影'].some(cmd => message.startsWith(cmd)) ||
    // 特殊指令格式
    message.includes('它在哪呢？') ||
    // 白名单管理指令（仅管理员）
    (username === WHITE_LIST_ADMIN && (message.startsWith('添加白名单') || message.startsWith('移除白名单') || message === '查看白名单'))
  )
  
  // 白名单检查 - 只有命令才需要检查白名单
  if (isCommand && !whiteList.includes(username) && !message.startsWith('添加白名单') && username !== WHITE_LIST_ADMIN) {
    bot.chat(`。。。`)
    return
  }
  
  // 处理添加白名单命令 - 只有管理员能使用
  if (message.startsWith('添加白名单') && username === WHITE_LIST_ADMIN) {
    const targetName = message.replace('添加白名单', '').trim()
    if (targetName) {
      if (!whiteList.includes(targetName)) {
        whiteList.push(targetName)
        saveWhiteList()
        bot.chat(`${targetName} 已添加到白名单`)
      } else {
        bot.chat(`${targetName} 已经在白名单中`)
      }
    }
    return
  }
  
  // 处理移除白名单命令 - 只有管理员能使用
  if (message.startsWith('移除白名单') && username === WHITE_LIST_ADMIN) {
    const targetName = message.replace('移除白名单', '').trim()
    if (targetName) {
      const index = whiteList.indexOf(targetName)
      if (index > -1 && targetName !== WHITE_LIST_ADMIN) {
        whiteList.splice(index, 1)
        saveWhiteList()
        bot.chat(`${targetName} 已从白名单移除`)
      } else {
        bot.chat(`${targetName} 不在白名单中或无法移除管理员`)
      }
    }
    return
  }
  
  // 处理查看白名单命令
  if (message === '查看白名单') {
    bot.chat(`当前白名单：${whiteList.join(', ')}`)
    return
  }
  
  // 处理指令序列，支持"说"指令包含空格
  const commands = []
  let remaining = message
  
  while (remaining) {
    // 检查是否是"<玩家名>它在哪呢？"命令
    if (remaining.includes('它在哪呢？')) {
      // 找到"它在哪呢？"的位置
      const whereIndex = remaining.indexOf('它在哪呢？')
      // 截取整个命令，包括玩家名和后缀
      const whereCommand = remaining.substring(0, whereIndex + 6) // 6是"它在哪呢？"的长度
      commands.push(whereCommand)
      remaining = remaining.substring(whereIndex + 6).trim()
    } else if (remaining.startsWith('说 ')) {
      // 找到"说 "后面的内容，直到遇到下一个指令
      // 检查是否有其他指令（w, s, a, d, 左键, 右键, q, 1-9, 跳, 守卫, 跟着, 战斗, 停止, 精打击）
      const nextCommandIndex = remaining.search(/\s+(w|s|a|d|左键|右键|q|[1-9]|跳|守卫|跟着|战斗|停止|精打击)\b/)
      
      if (nextCommandIndex !== -1) {
        // 有下一个指令，截取当前"说"指令
        const sayCommand = remaining.substring(0, nextCommandIndex)
        commands.push(sayCommand)
        remaining = remaining.substring(nextCommandIndex).trim()
      } else {
        // 没有下一个指令，整个剩余部分都是"说"指令
        commands.push(remaining)
        remaining = ''
      }
    } else if (remaining.startsWith('精打击')) {
      // 找到"精打击"后面的内容，直到遇到下一个指令
      // 检查是否有其他指令（w, s, a, d, 左键, 右键, q, 1-9, 跳, 守卫, 跟着, 战斗, 停止, 说）
      const nextCommandIndex = remaining.search(/\s+(w|s|a|d|左键|右键|q|[1-9]|跳|守卫|跟着|战斗|停止|说)\b/)
      
      if (nextCommandIndex !== -1) {
        // 有下一个指令，截取当前"精打击"指令
        const attackCommand = remaining.substring(0, nextCommandIndex)
        commands.push(attackCommand)
        remaining = remaining.substring(nextCommandIndex).trim()
      } else {
        // 没有下一个指令，整个剩余部分都是"精打击"指令
        commands.push(remaining)
        remaining = ''
      }
    } else {
      // 普通指令，按空格分隔
      const spaceIndex = remaining.indexOf(' ')
      if (spaceIndex !== -1) {
        const command = remaining.substring(0, spaceIndex)
        commands.push(command)
        remaining = remaining.substring(spaceIndex + 1).trim()
      } else {
        commands.push(remaining)
        remaining = ''
      }
    }
  }
  
  if (commands.length > 0) {
    // 处理所有指令
    commands.forEach((command, index) => {
      // 处理需要玩家上下文的指令
      if (command === '守卫') {
        setTimeout(() => {
          const player = bot.players[username]
          if (!player) {
            bot.chat("额")
            return
          }
          bot.chat('哦')
          guardArea(player.entity.position)
        }, index * 500)
        return
      }
      
      if (command === '跟着') {
        setTimeout(() => {
          const player = bot.players[username]
          if (!player) {
            bot.chat("额")
            return
          }
          bot.chat('哦')
          followPlayer(player)
        }, index * 500)
        return
      }
      
      if (command === 'PVP') {
        setTimeout(() => {
          const player = bot.players[username]
          if (!player) {
            bot.chat("额")
            return
          }
          const now = Date.now()
          if (now - lastAttackTime > MIN_ATTACK_DELAY) {
            bot.chat('oo')
            bot.pvp.attack(player.entity)
            lastAttackTime = now
          }
        }, index * 500)
        return
      }
      
      // 其他指令交给executeCommand处理，延迟执行
      setTimeout(() => {
        executeCommand(command)
      }, index * 500)
    })
  }
})

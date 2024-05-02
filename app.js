const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')
const app = express()
app.use(express.json())

let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

app.listen(3000, () => {
  console.log(`Server Running at http://localhost:3000/`)
})

initializeDbAndServer()

const convertStateDbObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertDistrictDbObjectToResponseObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

//Authenticate jwt token API

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//login user API

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
    SELECT * FROM user WHERE username = ${username}`

  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// Get States API

app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `
  SELECT * FROM state`
  const stateArray = await db.all(getStatesQuery)
  response.send(
    stateArray.map(eachState =>
      convertStateDbObjectToResponseObject(eachState),
    ),
  )
})

// Get State Query by ID API
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
  SELECT * FROM state WHERE state_id = ${stateId}`
  const state = await db.get(getStateQuery)
  response.send(convertStateDbObjectToResponseObject(state))
})

// Create District Query by ID API

app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const createDistrictQuery = `
  INSERT INTO district 
  (district_name, state_id, cases, cured, active, deaths)
  VALUES
  ('${districtName}', '${stateId}', '${cases}', '${cured}', '${active}', '${deaths}')`
  await db.run(createDistrictQuery)
  response.send('District Successfully Added')
})

// Get District Query
app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `
    SELECT * FROM district WHERE district_id = ${districtId}`
    const district = await db.get(getDistrictQuery)
    response.send(convertDistrictDbObjectToResponseObject(district))
  },
)

// Delete District API
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
    DELETE FROM district WHERE district_id = ${districtId}`
    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

// Update District API
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrictQuery = `
  UPDATE 
    district
  SET 
    district_name : '${districtName}',
    state_id : '${stateId}',
    cases : '${cases}',
    cured : '${cured}',
    active : '${active}',
    deaths : '${deaths}'
  WHERE 
    district_id = ${districtId}`

    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

// Stats API

app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const statsQuery = `
  SELECT 
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
  FROM 
    district
  WHERE 
    state_id = ${stateId}`
    const statesStats = db.all(statsQuery)
    response.send({
      totalCases: statesStats['SUM(Cases)'],
      totalCured: statesStats['SUM(Cured)'],
      totalActive: statesStats['SUM(Active)'],
      totalDeaths: statesStats['SUM(Deaths)'],
    })
  },
)

module.exports = app

const fs = require("fs")
const axios = require('axios').default;
const turf = require('@turf/turf');

const subStationsFields = 'OBJECTID,NAME,ID,OP_DIST,TAX_DIST,SUB_NUMBER,TYPE,latitude,longitude'

const uriRegions = 'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Retail_Service_Territories/FeatureServer/0/query?where=state%3D%27NY%27%20AND%20NOT%20objectid%3D%271511%27%20AND%20NOT%20objectid%3D%271976%27&outFields=*&f=pgeojson'

const uriSubstations = `https://ngrid.portal.esri.com/server/rest/services/SystemDataPortals/Substations/MapServer/0/query?f=geojson&where=1=1&outFields=${subStationsFields}&geometry={"xmin":-8575548.33894269,"ymin":4952711.68968534,"xmax":-7986065.976807439,"ymax":5478598.444287327,"spatialReference":{"wkid":102100}}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&returnGeometry=true`

const uriPowerLines = 'https://ngrid.portal.esri.com/server/rest/services/SystemDataPortals/LoadCapacity/MapServer/0/query?f=geojson&where=1=1&outFields=*&geometry={"xmin":-8575548.33894269,"ymin":4952711.68968534,"xmax":-7986065.976807439,"ymax":5478598.444287327,"spatialReference":{"wkid":102100}}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&returnGeometry=true'

const path = './db'

const createJSONFile = (data, fileName) => {
    fs.writeFile(`${path}/${fileName}.json`, JSON.stringify(data), (err, result) => {
        console.log({ err })
        console.log({ result })
    })
}

const getRegionsWithSubstations = (regions, substations) => {
    const regionCoordinatesFlat = regions.features.map((region) => {
        let coordinates = []
        region.geometry.coordinates.forEach((el) => {
            const coordinatesFlat = el.flat(Infinity)

            const latitudes = coordinatesFlat.filter(
                (_, index) => index % 2 === 0
            );
            const longitudes = coordinatesFlat.filter(
                (_, index) => index % 2 !== 0
            );

            const coors = latitudes.map((el, index) => [el, longitudes[index]]);

            coordinates = [...coordinates, coors]
        })
        return {
            ...region,
            geometry: {
                type: region.geometry.type,
                coordinates: coordinates,
            }
        }
    })
    let regionswithSubstations = []
    for (const region of regionCoordinatesFlat) {
        let substationsId = []
        let substationObject = []

        for (const coordinate of region.geometry.coordinates) {

            for (const substation of substations.features) {

                const pt = turf.point(substation.geometry.coordinates);
                const poly = turf.polygon([coordinate]);
                const isInside = turf.booleanPointInPolygon(pt, poly);
                if (isInside) {
                    substationsId = [...substationsId, `${substation.properties.NAME}_${substation.properties.OP_DIST}`]
                    substationObject = [...substationObject, substationsId]
                }

            }

        }

        const newFeature = {
            ...region,
            properties: {
                ...region.properties,
                // substations: substationObject,
                substationIds: substationsId,
            }
        }

        regionswithSubstations = [...regionswithSubstations, newFeature]

    }

    const struct = {
        type: 'FeatureCollection',
        features: regionswithSubstations,
    }

    return struct
}

const getSubstationsWithPowerLines = (substations, powerLines) => {
    let substationsWithPowerLines = []
    for (const substation of substations.features) {
        let powerLineIds = []

        const substationId = `${substation.properties.NAME}_${substation.properties.OP_DIST}`

        for (const powerLine of powerLines.features) {
            const poweLineId = `${powerLine.properties.Substation}_${powerLine.properties.Master_CDF.split('_')[1]}`

            if (poweLineId === substationId) {
                powerLineIds = [...powerLineIds, powerLine.properties.Master_CDF]
            }
        }
        const newFeature = {
            ...substation,
            properties: {
                ...substation.properties,
                powerLineIds: powerLineIds
            }
        }

        substationsWithPowerLines = [...substationsWithPowerLines, newFeature]
    }
    const struct = {
        type: 'FeatureCollection',
        features: substationsWithPowerLines,
    }
    return struct
}

const AddAllData = (regionsSubstations, powerLines) => {
    let regionsWithSubstationsWithPowerLines = []
    for (const regionSubstation of regionsSubstations.features) {
        let newFeatureFill = []
        let powerLineIds = []
        for (const substation of regionSubstation.properties.substationIds) {
            let substationsWithPowerLines = []

            for (const powerLine of powerLines.features) {
                const poweLineId = `${powerLine.properties.Substation}_${powerLine.properties.Master_CDF.split('_')[1]}`
                // const substationId = `${substation.properties.NAME}_${substation.properties.OP_DIST}`
                if (poweLineId === substation) {
                    powerLineIds = [...powerLineIds, powerLine.properties.Master_CDF]

                    substationsWithPowerLines = [...substationsWithPowerLines, poweLineId]
                    // substationsWithPowerLines = [...substationsWithPowerLines, { ...powerLine }]
                    // substationsWithPowerLines = [...substationsWithPowerLines, { ...powerLine, geometry: null }]
                }
            }

            const newSubstation = {
                ...substation,
                powerLines: substationsWithPowerLines
            }
            newFeatureFill = [...newFeatureFill, newSubstation]

        }

        const newFeature = {
            ...regionSubstation,
            properties: {
                ...regionSubstation.properties,
                // substations: newFeatureFill,
                powerLineIds: powerLineIds
            }
        }

        regionsWithSubstationsWithPowerLines = [...regionsWithSubstationsWithPowerLines, newFeature]
    }

    return {
        type: 'FeatureCollection',
        features: regionsWithSubstationsWithPowerLines
    }
};

; (async () => {
    const resRegions = await axios.get(uriRegions)
    const resSubstations = await axios.get(uriSubstations)
    const resPowerLines = await axios.get(uriPowerLines)
    const regions = resRegions.data
    const substations = resSubstations.data
    const powerLines = resPowerLines.data

    const regionsSubstations = getRegionsWithSubstations(regions, substations)
    const substationsPowerLines = getSubstationsWithPowerLines(substations, powerLines)
    const allData = AddAllData(regionsSubstations, powerLines)
    createJSONFile(substationsPowerLines, 'substationsv2')
    createJSONFile(powerLines, 'powerLinesv2')
    createJSONFile(allData, 'regionsv2')

})();
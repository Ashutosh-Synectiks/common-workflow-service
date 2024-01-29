const { connectToDatabase } = require("../db/dbConnector");
const { SFNClient, UpdateStateMachineCommand } = require("@aws-sdk/client-sfn");
const { generateStateMachine2 } = require("./generateStateMachine")
exports.handler = async (event) => {
    const id = event.pathParameters?.id;
    if (!id) {
        return {
            statusCode: 400,
            headers: {
                "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({ error: 'Missing workflow id path parameter' }),
        };
    }
    const requestBody = JSON.parse(event.body);
    const { updated_by_id, stages } = requestBody;
    const sfnClient = new SFNClient({ region: "us-east-1" });
    const client = await connectToDatabase();
    try {
        const workflowData = await client.query(
            `select arn, metadata from workflows_table where id = $1`,
            [id]
        );

        const metaData = workflowData.rows[0].metadata;
        const newStateMachine = generateStateMachine2(stages);

        const input = {
            stateMachineArn: workflowData.rows[0].arn,
            definition: JSON.stringify(newStateMachine),
            roleArn: "arn:aws:iam::657907747545:role/backendstepfunc-Role",
        };
        const command = new UpdateStateMachineCommand(input);
        const commandResponse = await sfnClient.send(command);

        const resource = await client.query(
            `SELECT (r.resource -> 'name') as name,
                    (r.resource -> 'image') as image_url
            FROM resources_table as r
            WHERE id = $1`,
            [updated_by_id]
        );

        metaData.stages = stages;
        metaData.updated_by = {
            id: updated_by_id,
            name: resource.rows[0].name,
            image_url: resource.rows[0].image_url
        }
        metaData.updated_time = commandResponse.updateDate;
        let query = `
            UPDATE workflows_table SET metadata = $1 WHERE id = $2
        	returning metadata->'stages' AS stages`;

        const result = await client.query(query, [
            metaData,
            id,
        ]);

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify(result.rows[0]),
        };
    } catch (error) {
        console.error("Error updating data:", error);
        if (error.name == "StateMachineAlreadyExists") {
            return {
                statusCode: 500,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                },
                body: JSON.stringify({
                    error: "Workflow with same name already exists",
                }),
            };
        }
        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({
                message: "Internal Server Error",
                error: error.message,
            }),
        };
    }
};


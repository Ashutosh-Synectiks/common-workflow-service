exports.startTask = async (event) => {
    const params = event.queryStringParameters;
    const requestBody = JSON.parse(event.body);

    const { resource_id } = params;
    const { task_id, start_date } = requestBody;

    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    const secretsManagerClient = new SecretsManagerClient({ region: 'us-east-1' });
    const configuration = await secretsManagerClient.send(new GetSecretValueCommand({ SecretId: 'serverless/lambda/credintials' }));
    const dbConfig = JSON.parse(configuration.SecretString);

    const { Client } = require('pg');
    const client = new Client({
        host: dbConfig.host,
        port: dbConfig.port,
        database: 'workflow',
        user: dbConfig.engine,
        password: dbConfig.password
    });

    try {
        await client.connect();

        await client.query(`
        UPDATE task_table
        SET task = jsonb_set(
            jsonb_set(task, '{start_date}', '"${start_date}"'),
            '{status}', '"Incomplete"'
        )
        WHERE id = '${task_id}' AND assigne_id = '${resource_id}'`);


        return {
            statusCode: 201,
            body: JSON.stringify({ message: "Task started " })
        };
    } catch (error) {
        console.error("error", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Error while starting task" })
        };
    } finally {
        await client.end();
    }
};
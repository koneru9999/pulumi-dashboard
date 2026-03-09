const PROVIDER_COLORS: Record<string, string> = {
  aws: '#FF9900',
  'aws-native': '#FF9900',
  gcp: '#4285F4',
  'google-native': '#4285F4',
  azure: '#0078D4',
  'azure-native': '#0078D4',
  pulumi: '#8A3FC7',
  docker: '#2496ED',
  kubernetes: '#326CE5',
  k8s: '#326CE5',
  random: '#10B981',
  tls: '#6366F1',
}

export function providerColor(type: string): string {
  const provider = type.split(':')[0]
  return PROVIDER_COLORS[provider] ?? '#6B7280'
}

export function resourceName(urn: string): string {
  return urn.split('::').at(-1) ?? urn
}

export function arnToConsoleUrl(arn: string): string | null {
  if (!arn.startsWith('arn:')) {
    return null
  }
  const parts = arn.split(':')
  if (parts.length < 6) {
    return null
  }
  const [, partition, service, region, account, ...resourceParts] = parts
  const resource = resourceParts.join(':')
  if (partition !== 'aws') {
    return null
  }
  const base = 'https://console.aws.amazon.com'
  switch (service) {
    case 'iam': {
      if (resource.startsWith('role/')) {
        return `${base}/iam/home#/roles/${resource.slice(5)}`
      }
      if (resource.startsWith('policy/')) {
        return `${base}/iam/home#/policies/${encodeURIComponent(arn)}`
      }
      return `${base}/iam/home`
    }
    case 'lambda': {
      const name = resource.split(':')[1]
      return name ? `${base}/lambda/home?region=${region}#/functions/${name}` : null
    }
    case 'logs': {
      const logGroup = resource.replace(/^log-group:/, '')
      return `${base}/cloudwatch/home?region=${region}#logsV2:log-groups/log-group-name/${encodeURIComponent(logGroup)}`
    }
    case 'cloudwatch': {
      if (resource.startsWith('alarm:')) {
        return `${base}/cloudwatch/home?region=${region}#alarmsV2:alarm/${encodeURIComponent(resource.slice(6))}`
      }
      return null
    }
    case 'states': {
      if (resource.startsWith('stateMachine:')) {
        return `${base}/states/home?region=${region}#/statemachines/view/${encodeURIComponent(arn)}`
      }
      return null
    }
    case 'sqs': {
      const queueUrl = `https://sqs.${region}.amazonaws.com/${account}/${resource}`
      return `${base}/sqs/v2/home?region=${region}#/queues/${encodeURIComponent(queueUrl)}`
    }
    case 'sns':
      return `${base}/sns/v3/home?region=${region}#/topic/${encodeURIComponent(arn)}`
    case 'ecr': {
      if (resource.startsWith('repository/')) {
        return `${base}/ecr/repositories/private/${account}/${resource.slice(11)}?region=${region}`
      }
      return null
    }
    case 's3':
      return `${base}/s3/buckets/${resource}`
    case 'dynamodb': {
      if (resource.startsWith('table/')) {
        return `${base}/dynamodbv2/home?region=${region}#table?name=${encodeURIComponent(resource.slice(6).split('/')[0])}`
      }
      return null
    }
    case 'rds': {
      if (resource.startsWith('db:')) {
        return `${base}/rds/home?region=${region}#database:id=${resource.slice(3)}`
      }
      return null
    }
    case 'secretsmanager':
      return `${base}/secretsmanager/secret?name=${encodeURIComponent(resource.replace(/^secret:/, ''))}&region=${region}`
    case 'ssm': {
      if (resource.startsWith('parameter/')) {
        return `${base}/systems-manager/parameters/${resource.slice(10)}/description?region=${region}`
      }
      return null
    }
    default:
      return null
  }
}

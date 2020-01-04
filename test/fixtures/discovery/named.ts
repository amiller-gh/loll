export function GET(_req: Express.Request, _res: Express.Response) {
  return {
    status: 'success',
    data: 'get',
  }
}

export function POST(_req: Express.Request, _res: Express.Response) {
  return {
    status: 'success',
    data: 'post',
  }
}

export function PUT(_req: Express.Request, _res: Express.Response) {
  return {
    status: 'success',
    data: 'put',
  }
}

export function DELETE(_req: Express.Request, _res: Express.Response) {
  return {
    status: 'success',
    data: 'delete',
  }
}
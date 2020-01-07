export default class ClassExports {
  private state: any = { called: false };

  GET(_req: Express.Request, _res: Express.Response) {
    const prevCalled = this.state.called;
    this.state.called = true;
    return {
      status: 'success',
      data: prevCalled,
    }
  }
}